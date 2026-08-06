from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Usuario, CodigoInvitacion
from typing import Optional
from datetime import datetime
import secrets
from auth import verificar_password, hashear_password, crear_token, get_usuario_actual
from pydantic import BaseModel
from datetime import datetime

router_auth = APIRouter(prefix="/auth")

class RegistroData(BaseModel):
    nombre: str
    email: str
    password: str
    codigo_invitacion: Optional[str] = None

class LoginData(BaseModel):
    email: str
    password: str

@router_auth.post("/registro")
async def registro(data: RegistroData, db: AsyncSession = Depends(get_db)):
    # Verificar código de invitación
    if not data.codigo_invitacion:
        raise HTTPException(status_code=403, detail="Se requiere un código de invitación")
    
    codigo_res = await db.execute(select(CodigoInvitacion).where(
        CodigoInvitacion.codigo == data.codigo_invitacion,
        CodigoInvitacion.usado == False
    ))
    codigo = codigo_res.scalar_one_or_none()
    if not codigo:
        raise HTTPException(status_code=403, detail="Código de invitación inválido o ya utilizado")

    result = await db.execute(select(Usuario).where(Usuario.email == data.email))
    existente = result.scalar_one_or_none()
    if existente:
        raise HTTPException(status_code=400, detail="Ya existe una cuenta con ese email")

    
    nuevo = Usuario(
        nombre=data.nombre,
        email=data.email,
        password_hash=hashear_password(data.password),
        fecha_registro=datetime.now().strftime('%Y-%m-%d')
    )
    db.add(nuevo)
    
    # Marcar código como usado
    codigo.usado = True
    codigo.email_usado = data.email
    codigo.fecha_uso = datetime.now().strftime('%Y-%m-%d')
    
    await db.commit()
    await db.refresh(nuevo)
    token = crear_token({"sub": str(nuevo.id)})
    return {"token": token, "nombre": nuevo.nombre, "email": nuevo.email}

@router_auth.post("/generar-codigo")
async def generar_codigo(notas: str = "", db: AsyncSession = Depends(get_db)):
    codigo = secrets.token_urlsafe(8).upper()
    nuevo = CodigoInvitacion(
        codigo=codigo,
        usado=False,
        fecha_creacion=datetime.now().strftime('%Y-%m-%d'),
        notas=notas
    )
    db.add(nuevo)
    await db.commit()
    return {"codigo": codigo}

@router_auth.get("/codigos")
async def listar_codigos(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CodigoInvitacion))
    return result.scalars().all()


@router_auth.post("/login")
async def login(data: LoginData, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Usuario).where(Usuario.email == data.email))
    usuario = result.scalar_one_or_none()
    if not usuario or not verificar_password(data.password, usuario.password_hash):
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")
    token = crear_token({"sub": usuario.email})
    return {"token": token, "nombre": usuario.nombre, "email": usuario.email}

@router_auth.get("/me")
async def me(usuario=Depends(get_usuario_actual)):
    return {"id": usuario.id, "nombre": usuario.nombre, "email": usuario.email}

    class SolicitarResetData(BaseModel):
    email: str

class ResetPasswordData(BaseModel):
    token: str
    nueva_password: str

@router_auth.post("/solicitar-reset")
async def solicitar_reset(data: SolicitarResetData, db: AsyncSession = Depends(get_db)):
    import resend
    from datetime import timedelta
    
    import os
    resend.api_key = os.environ.get("RESEND_API_KEY", "")
    
    result = await db.execute(select(Usuario).where(Usuario.email == data.email))
    usuario = result.scalar_one_or_none()
    
    if not usuario:
        return {"mensaje": "Si el email existe, recibirás un correo con instrucciones."}
    
    from models import TokenReset
    token = secrets.token_urlsafe(32)
    fecha_creacion = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    fecha_expiracion = (datetime.now() + timedelta(hours=2)).strftime('%Y-%m-%d %H:%M:%S')
    
    nuevo_token = TokenReset(
        email=data.email,
        token=token,
        usado=False,
        fecha_creacion=fecha_creacion,
        fecha_expiracion=fecha_expiracion
    )
    db.add(nuevo_token)
    await db.commit()
    
    link = f"https://proptrack-puce.vercel.app/reset?token={token}"
    
    resend.Emails.send({
        "from": "PropTrack <onboarding@resend.dev>",
        "to": data.email,
        "subject": "Recuperar contraseña — PropTrack",
        "html": f"""
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; background: #0b0e11; color: #eaecef; padding: 40px; border-radius: 12px;">
            <h2 style="color: #f0b90b;">🏠 PropTrack</h2>
            <p>Recibimos una solicitud para restablecer tu contraseña.</p>
            <p>Hacé clic en el botón para crear una nueva contraseña:</p>
            <a href="{link}" style="display: inline-block; background: #f0b90b; color: #0b0e11; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 20px 0;">
                Restablecer contraseña
            </a>
            <p style="color: #848e9c; font-size: 13px;">Este link expira en 2 horas. Si no solicitaste el reset, ignorá este email.</p>
        </div>
        """
    })
    
    return {"mensaje": "Si el email existe003180, recibirás un correo con instrucciones."}

@router_auth.post("/reset-password")
async def reset_password(data: ResetPasswordData, db: AsyncSession = Depends(get_db)):
    from models import TokenReset
    
    result = await db.execute(select(TokenReset).where(
        TokenReset.token == data.token,
        TokenReset.usado == False
    ))
    token_obj = result.scalar_one_or_none()
    
    if not token_obj:
        raise HTTPException(status_code=400, detail="Token inválido o ya utilizado")
    
    if datetime.now().strftime('%Y-%m-%d %H:%M:%S') > token_obj.fecha_expiracion:
        raise HTTPException(status_code=400, detail="El link expiró. Solicitá uno nuevo.")
    
    result2 = await db.execute(select(Usuario).where(Usuario.email == token_obj.email))
    usuario = result2.scalar_one_or_none()
    
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    usuario.password_hash = hashear_password(data.nueva_password)
    token_obj.usado = True
    token_obj.fecha_uso = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    await db.commit()
    return {"mensaje": "Contraseña actualizada correctamente"}