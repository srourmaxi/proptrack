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