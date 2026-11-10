from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Propiedad, Valuacion, Alquiler, MovimientoFinanciero
from pydantic import BaseModel
from typing import Optional
from datetime import date
import json

router = APIRouter()

GASTOS_KEYS = ['comision','sellado','escribania','ganancias','plusvalia','certificados','gestion','otros']

class PropiedadCreate(BaseModel):
    nombre: str
    tipo: Optional[str] = None
    direccion: Optional[str] = None
    ubicacion: Optional[str] = None
    m2_cubiertos: Optional[float] = None
    m2_semicubiertos: Optional[float] = None
    m2_descubiertos: Optional[float] = None
    m2_ponderados: Optional[float] = None
    hectareas: Optional[float] = None
    ambientes: Optional[int] = None
    banos: Optional[int] = None
    cochera: Optional[bool] = False
    torre: Optional[str] = None
    piso: Optional[str] = None
    depto: Optional[str] = None
    uf: Optional[str] = None
    fecha_compra: Optional[str] = None
    precio_compra: Optional[float] = None
    gc_comision: Optional[float] = 0
    gc_comision_usd: Optional[float] = 0
    gc_sellado: Optional[float] = 0
    gc_sellado_usd: Optional[float] = 0
    gc_escribania: Optional[float] = 0
    gc_escribania_usd: Optional[float] = 0
    gc_ganancias: Optional[float] = 0
    gc_ganancias_usd: Optional[float] = 0
    gc_plusvalia: Optional[float] = 0
    gc_plusvalia_usd: Optional[float] = 0
    gc_certificados: Optional[float] = 0
    gc_certificados_usd: Optional[float] = 0
    gc_gestion: Optional[float] = 0
    gc_gestion_usd: Optional[float] = 0
    gc_otros: Optional[float] = 0
    gc_otros_usd: Optional[float] = 0
    gc_monedas: Optional[str] = '{}'
    gc_cotizaciones: Optional[str] = '{}'
    vendida: Optional[bool] = False
    fecha_venta: Optional[str] = None
    precio_venta: Optional[float] = None
    gv_comision: Optional[float] = 0
    gv_comision_usd: Optional[float] = 0
    gv_sellado: Optional[float] = 0
    gv_sellado_usd: Optional[float] = 0
    gv_escribania: Optional[float] = 0
    gv_escribania_usd: Optional[float] = 0
    gv_ganancias: Optional[float] = 0
    gv_ganancias_usd: Optional[float] = 0
    gv_plusvalia: Optional[float] = 0
    gv_plusvalia_usd: Optional[float] = 0
    gv_certificados: Optional[float] = 0
    gv_certificados_usd: Optional[float] = 0
    gv_gestion: Optional[float] = 0
    gv_gestion_usd: Optional[float] = 0
    gv_otros: Optional[float] = 0
    gv_otros_usd: Optional[float] = 0
    gv_monedas: Optional[str] = '{}'
    gv_cotizaciones: Optional[str] = '{}'
    notas: Optional[str] = None
    estado_obra: Optional[str] = 'terminado'
    fecha_entrega: Optional[str] = None
    valor_estimado_entrega: Optional[float] = None
    partido: Optional[str] = None
    provincia: Optional[str] = None
    pais: Optional[str] = None
    comprador_nombre: Optional[str] = None

class ValuacionCreate(BaseModel):
    propiedad_id: int
    fecha: str
    valor_usd: float
    fuente: Optional[str] = "manual"
    notas: Optional[str] = None

class AlquilerCreate(BaseModel):
    propiedad_id: int
    fecha_desde: str
    fecha_hasta: Optional[str] = None
    monto_usd: float
    inquilino: Optional[str] = None
    notas: Optional[str] = None

class MovimientoCreate(BaseModel):
    propiedad_id: int
    operacion: str
    tipo: str
    concepto: Optional[str] = None
    fecha_vencimiento: Optional[str] = None
    fecha_pago: Optional[str] = None
    monto: Optional[float] = 0
    moneda: Optional[str] = 'USD'
    cotizacion: Optional[float] = 1
    monto_usd: Optional[float] = 0
    pagado: Optional[bool] = False
    notas: Optional[str] = None

class MovimientoUpdate(BaseModel):
    pagado: bool
    fecha_pago: Optional[str] = None

def gastos_total(p, prefijo):
    return round(sum(getattr(p, f'{prefijo}_{k}_usd') or 0 for k in GASTOS_KEYS), 2)

def meses_entre(f1, f2):
    try:
        from datetime import datetime
        d1 = datetime.strptime(f1, '%Y-%m-%d')
        d2 = datetime.strptime(f2, '%Y-%m-%d')
        return max(0, (d2.year - d1.year) * 12 + (d2.month - d1.month))
    except:
        return 0

# ── Propiedades ──────────────────────────────────────────────────────────

@router.get("/propiedades")
async def listar_propiedades(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Propiedad))
    return result.scalars().all()

@router.post("/propiedades")
async def crear_propiedad(data: PropiedadCreate, db: AsyncSession = Depends(get_db)):
    p = Propiedad(**data.dict())
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p
    
@router.put("/propiedades/{id}")
async def actualizar_propiedad(id: int, data: PropiedadCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Propiedad).where(Propiedad.id == id))
    p = result.scalar_one_or_none()
    if p:
        data_dict = data.dict(exclude_unset=False)
        for k, v in data_dict.items():
            if hasattr(p, k) and v is not None:
                setattr(p, k, v)
        await db.commit()
        await db.refresh(p)
    return p

@router.delete("/propiedades/{id}")
async def eliminar_propiedad(id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Propiedad).where(Propiedad.id == id))
    p = result.scalar_one_or_none()
    if p:
        await db.delete(p)
        await db.commit()
    return {"ok": True}

# ── Valuaciones ──────────────────────────────────────────────────────────

@router.get("/valuaciones/{propiedad_id}")
async def listar_valuaciones(propiedad_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Valuacion).where(Valuacion.propiedad_id == propiedad_id))
    return result.scalars().all()

@router.post("/valuaciones")
async def crear_valuacion(data: ValuacionCreate, db: AsyncSession = Depends(get_db)):
    v = Valuacion(**data.dict())
    db.add(v)
    await db.commit()
    await db.refresh(v)
    return v

@router.delete("/valuaciones/{id}")
async def eliminar_valuacion(id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Valuacion).where(Valuacion.id == id))
    v = result.scalar_one_or_none()
    if v:
        await db.delete(v)
        await db.commit()
    return {"ok": True}

# ── Alquileres ───────────────────────────────────────────────────────────

@router.get("/alquileres/{propiedad_id}")
async def listar_alquileres(propiedad_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Alquiler).where(Alquiler.propiedad_id == propiedad_id))
    return result.scalars().all()

@router.post("/alquileres")
async def crear_alquiler(data: AlquilerCreate, db: AsyncSession = Depends(get_db)):
    a = Alquiler(**data.dict())
    db.add(a)
    await db.commit()
    await db.refresh(a)
    return a

@router.delete("/alquileres/{id}")
async def eliminar_alquiler(id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Alquiler).where(Alquiler.id == id))
    a = result.scalar_one_or_none()
    if a:
        await db.delete(a)
        await db.commit()
    return {"ok": True}

# ── Movimientos financieros ──────────────────────────────────────────────

@router.get("/movimientos/{propiedad_id}")
async def listar_movimientos(propiedad_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MovimientoFinanciero).where(MovimientoFinanciero.propiedad_id == propiedad_id)
    )
    return result.scalars().all()

@router.post("/movimientos")
async def crear_movimiento(data: MovimientoCreate, db: AsyncSession = Depends(get_db)):
    m = MovimientoFinanciero(**data.dict())
    db.add(m)
    await db.commit()
    await db.refresh(m)
    return m

@router.put("/movimientos/{id}/pagar")
async def confirmar_pago(id: int, data: MovimientoUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MovimientoFinanciero).where(MovimientoFinanciero.id == id))
    m = result.scalar_one_or_none()
    if m:
        m.pagado = data.pagado
        m.fecha_pago = data.fecha_pago
        await db.commit()
        await db.refresh(m)
    return m

@router.delete("/movimientos/{id}")
async def eliminar_movimiento(id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MovimientoFinanciero).where(MovimientoFinanciero.id == id))
    m = result.scalar_one_or_none()
    if m:
        await db.delete(m)
        await db.commit()
    return {"ok": True}

@router.get("/roi/{propiedad_id}")
async def calcular_roi(propiedad_id: int, db: AsyncSession = Depends(get_db)):
    prop_res = await db.execute(select(Propiedad).where(Propiedad.id == propiedad_id))
    p = prop_res.scalar_one_or_none()
    if not p:
        return {"error": "Propiedad no encontrada"}

    vals_res = await db.execute(select(Valuacion).where(Valuacion.propiedad_id == propiedad_id))
    vals = sorted(vals_res.scalars().all(), key=lambda x: x.fecha)

    alqs_res = await db.execute(select(Alquiler).where(Alquiler.propiedad_id == propiedad_id))
    alqs = alqs_res.scalars().all()

    gc = gastos_total(p, 'gc')
    gv = gastos_total(p, 'gv')
    costo_entrada = (p.precio_compra or 0) + gc
    renta_total = round(sum(a.monto_usd for a in alqs), 2)

    m2 = p.m2_cubiertos if p.tipo == 'Lote' else (p.m2_ponderados or p.m2_cubiertos)
    ha = p.hectareas

    # USD/m² a la compra
    usd_m2_compra = round(costo_entrada / m2, 2) if m2 and m2 > 0 else None
    usd_ha_compra = round(costo_entrada / ha, 2) if ha and ha > 0 else None

    if p.vendida and p.precio_venta:
        ingreso_neto = (p.precio_venta or 0) - gv
        ganancia_capital = ingreso_neto - costo_entrada
        valor_actual = p.precio_venta
        # USD/m² a la venta
        usd_m2_venta = round(p.precio_venta / m2, 2) if m2 and m2 > 0 else None
        usd_ha_venta = round(p.precio_venta / ha, 2) if ha and ha > 0 else None
    else:
        valor_actual = vals[-1].valor_usd if vals else (p.precio_compra or 0)
        ingreso_neto = None
        ganancia_capital = valor_actual - costo_entrada
        usd_m2_venta = None
        usd_ha_venta = None

    ganancia_total = ganancia_capital + renta_total
    roi = (ganancia_total / costo_entrada * 100) if costo_entrada > 0 else 0

    # ROI anual
    from datetime import date
    hoy = date.today()
    fecha_inicio = p.fecha_compra
    fecha_fin = p.fecha_venta if p.vendida and p.fecha_venta else str(hoy)
    try:
        fi = date.fromisoformat(fecha_inicio)
        ff = date.fromisoformat(fecha_fin)
        meses = max(1, round((ff - fi).days / 30.44))
    except:
        meses = None

    roi_anual = None
    if meses and roi != 0:
        roi_anual = round(((1 + roi/100) ** (12/meses) - 1) * 100, 2)

    # GAP vs mercado (solo para vendidas)
    gap_vs_mercado = None
    gap_porcentaje = None
    if p.vendida and p.precio_venta and vals:
        ultima_val = vals[-1].valor_usd
        gap_vs_mercado = round(p.precio_venta - ultima_val, 2)
        gap_porcentaje = round((gap_vs_mercado / ultima_val * 100), 2) if ultima_val > 0 else None

    valor_m2 = round(valor_actual / m2, 2) if m2 and m2 > 0 else None
    valor_ha = round(valor_actual / ha, 2) if ha and ha > 0 else None

    return {
        "propiedad": p.nombre,
        "vendida": p.vendida,
        "costo_entrada": round(costo_entrada, 2),
        "gastos_compra": round(gc, 2),
        "precio_compra": p.precio_compra,
        "valor_actual": round(valor_actual, 2),
        "ingreso_neto_venta": round(ingreso_neto, 2) if ingreso_neto is not None else None,
        "gastos_venta": round(gv, 2),
        "ganancia_capital": round(ganancia_capital, 2),
        "renta_acumulada": round(renta_total, 2),
        "ganancia_total": round(ganancia_total, 2),
        "roi_porcentaje": round(roi, 2),
        "valor_m2": valor_m2,
        "valor_ha": valor_ha,
        "usd_m2_compra": usd_m2_compra,
        "usd_ha_compra": usd_ha_compra,
        "usd_m2_venta": usd_m2_venta,
        "usd_ha_venta": usd_ha_venta,
    "valor_estimado_entrega": p.valor_estimado_entrega,
        "ganancia_estimada_entrega": round((p.valor_estimado_entrega or 0) - costo_entrada, 2) if p.valor_estimado_entrega else None,
        "roi_estimado_entrega": round(((p.valor_estimado_entrega or 0) - costo_entrada) / costo_entrada * 100, 2) if p.valor_estimado_entrega and costo_entrada > 0 else None,
        "usd_ha_venta": usd_ha_venta,
        "roi_anual": roi_anual,
        "meses_operacion": meses,
        "gap_vs_mercado": gap_vs_mercado,
        "gap_porcentaje": gap_porcentaje,
    }
# ── Calculador de precio financiado ─────────────────────────────────────

class MovimientoCalculo(BaseModel):
    fecha_vencimiento: str
    monto_usd: float

class CalculoFinanciado(BaseModel):
    precio_contado: float
    fecha_base: str
    tasa_mensual: float
    movimientos: list[MovimientoCalculo]

@router.post("/calcular-financiado")
async def calcular_precio_financiado(data: CalculoFinanciado):
    vp_total = 0
    detalle = []
    for m in data.movimientos:
        meses = meses_entre(data.fecha_base, m.fecha_vencimiento)
        factor = (1 + data.tasa_mensual / 100) ** meses
        vp = round(m.monto_usd / factor, 2)
        vp_total += vp
        detalle.append({
            "fecha": m.fecha_vencimiento,
            "monto_nominal": m.monto_usd,
            "meses": meses,
            "valor_presente": vp,
        })

    costo_financiero = round(data.precio_contado - vp_total, 2)
    precio_sugerido = round(data.precio_contado + max(0, costo_financiero), 2)

    return {
        "precio_contado": data.precio_contado,
        "valor_presente_total": round(vp_total, 2),
        "costo_financiero": costo_financiero,
        "precio_financiado_sugerido": precio_sugerido,
        "tasa_mensual": data.tasa_mensual,
        "detalle": detalle,
    }

# ── Resumen cartera ──────────────────────────────────────────────────────

@router.get("/resumen")
async def resumen_cartera(db: AsyncSession = Depends(get_db)):
    props = await db.execute(select(Propiedad))
    todas = props.scalars().all()
    activas = [p for p in todas if not p.vendida]
    vendidas = [p for p in todas if p.vendida]

    total_invertido = sum((p.precio_compra or 0) + gastos_total(p, 'gc') for p in activas)
    ganancia_realizada = sum(
        ((p.precio_venta or 0) - gastos_total(p, 'gv')) -
        ((p.precio_compra or 0) + gastos_total(p, 'gc'))
        for p in vendidas
    )

    return {
        "activas": len(activas),
        "vendidas": len(vendidas),
        "total_invertido": round(total_invertido, 2),
        "ganancia_realizada": round(ganancia_realizada, 2),
    }# ── Parser IA ─────────────────────────────────────────────────────────────

# ── Parser sin IA ─────────────────────────────────────────────────────────

class ParserRequest(BaseModel):
    texto: str
    fecha_base: Optional[str] = None

@router.post("/parsear-financiacion")
async def parsear_financiacion(data: ParserRequest):
    # Primero intenta con IA; si falla (sin clave, sin saldo, error de red), usa el parser por reglas.
    try:
        from ia_parser import parsear_con_ia
        res = await parsear_con_ia(data.texto)
        if res["movimientos"]:
            return res
    except Exception as e:
        print("IA no disponible, uso parser por reglas:", e)
    from parser_helper import parsear_texto_financiacion
    return parsear_texto_financiacion(data.texto, data.fecha_base)

# ── Módulo alquiler ──────────────────────────────────────────────────────

class AlquilerContrato(BaseModel):
    propiedad_id: int
    fecha_inicio: str
    monto: float
    moneda: str = 'USD'
    cotizacion_usd: Optional[float] = 1
    periodo_actualizacion: int = 6
    indice_actualizacion: str = 'ICL'
    porcentaje_fijo: Optional[float] = None
    inquilino: Optional[str] = None
    notas: Optional[str] = None

class AlquilerContratoUpdate(BaseModel):
    monto: Optional[float] = None
    moneda: Optional[str] = None
    cotizacion_usd: Optional[float] = None
    periodo_actualizacion: Optional[int] = None
    indice_actualizacion: Optional[str] = None
    porcentaje_fijo: Optional[float] = None
    inquilino: Optional[str] = None
    notas: Optional[str] = None

INDICES = ['ICL','IPC','CasaPropia','CAC','CER','IS','IPIM','UVA','% Fijo']

@router.post("/calcular-alquiler")
async def calcular_alquiler(data: AlquilerContrato, db: AsyncSession = Depends(get_db)):
    prop_res = await db.execute(select(Propiedad).where(Propiedad.id == data.propiedad_id))
    p = prop_res.scalar_one_or_none()
    if not p:
        return {"error": "Propiedad no encontrada"}

    gc = sum(getattr(p, f'gc_{k}_usd') or 0 for k in ['comision','sellado','escribania','ganancias','plusvalia','certificados','gestion','otros'])
    costo_entrada = (p.precio_compra or 0) + gc

    monto_usd = data.monto if data.moneda == 'USD' else (data.monto / data.cotizacion_usd if data.cotizacion_usd else 0)
    renta_mensual_usd = monto_usd
    renta_anual_usd = renta_mensual_usd * 12
    yield_anual = (renta_anual_usd / costo_entrada * 100) if costo_entrada > 0 else 0
    anos_recupero = (costo_entrada / renta_anual_usd) if renta_anual_usd > 0 else None

    return {
        "costo_entrada": round(costo_entrada, 2),
        "monto_mensual_usd": round(monto_usd, 2),
        "renta_anual_usd": round(renta_anual_usd, 2),
        "yield_anual": round(yield_anual, 2),
        "anos_recupero": round(anos_recupero, 2) if anos_recupero else None,
        "periodo_actualizacion": data.periodo_actualizacion,
        "indice_actualizacion": data.indice_actualizacion,
        "moneda": data.moneda,
    }

@router.get("/indices-actualizacion")
async def get_indices():
    return {"indices": INDICES}
    # ── Cobros de alquiler ────────────────────────────────────────────────────

class CobroCreate(BaseModel):
    alquiler_id: int
    propiedad_id: int
    periodo: str
    monto_esperado: float
    monto_cobrado: Optional[float] = 0
    fecha_cobro: Optional[str] = None
    estado: Optional[str] = 'pendiente'
    notas: Optional[str] = None

class CobroUpdate(BaseModel):
    monto_cobrado: Optional[float] = None
    fecha_cobro: Optional[str] = None
    estado: Optional[str] = None
    notas: Optional[str] = None

class GastoAlquilerCreate(BaseModel):
    alquiler_id: int
    propiedad_id: int
    periodo: Optional[str] = None
    tipo: str
    descripcion: Optional[str] = None
    monto: float
    moneda: Optional[str] = 'USD'
    cotizacion_usd: Optional[float] = 1
    monto_usd: float
    fecha: Optional[str] = None
    notas: Optional[str] = None

from models import CobroAlquiler, GastoAlquiler

@router.get("/cobros/{propiedad_id}")
async def listar_cobros(propiedad_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CobroAlquiler).where(CobroAlquiler.propiedad_id == propiedad_id))
    return result.scalars().all()

@router.post("/cobros")
async def crear_cobro(data: CobroCreate, db: AsyncSession = Depends(get_db)):
    c = CobroAlquiler(**data.dict())
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c

@router.put("/cobros/{id}")
async def actualizar_cobro(id: int, data: CobroUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CobroAlquiler).where(CobroAlquiler.id == id))
    c = result.scalar_one_or_none()
    if c:
        for k, v in data.dict(exclude_none=True).items():
            setattr(c, k, v)
        await db.commit()
        await db.refresh(c)
    return c

@router.delete("/cobros/{id}")
async def eliminar_cobro(id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CobroAlquiler).where(CobroAlquiler.id == id))
    c = result.scalar_one_or_none()
    if c:
        await db.delete(c)
        await db.commit()
    return {"ok": True}

@router.get("/gastos-alquiler/{propiedad_id}")
async def listar_gastos_alquiler(propiedad_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GastoAlquiler).where(GastoAlquiler.propiedad_id == propiedad_id))
    return result.scalars().all()

@router.post("/gastos-alquiler")
async def crear_gasto_alquiler(data: GastoAlquilerCreate, db: AsyncSession = Depends(get_db)):
    g = GastoAlquiler(**data.dict())
    db.add(g)
    await db.commit()
    await db.refresh(g)
    return g

@router.delete("/gastos-alquiler/{id}")
async def eliminar_gasto_alquiler(id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GastoAlquiler).where(GastoAlquiler.id == id))
    g = result.scalar_one_or_none()
    if g:
        await db.delete(g)
        await db.commit()
    return {"ok": True}

@router.get("/resumen-alquiler/{propiedad_id}")
async def resumen_alquiler(propiedad_id: int, db: AsyncSession = Depends(get_db)):
    cobros_r = await db.execute(select(CobroAlquiler).where(CobroAlquiler.propiedad_id == propiedad_id))
    cobros = cobros_r.scalars().all()
    gastos_r = await db.execute(select(GastoAlquiler).where(GastoAlquiler.propiedad_id == propiedad_id))
    gastos = gastos_r.scalars().all()

    total_esperado = sum(c.monto_esperado for c in cobros)
    total_cobrado = sum(c.monto_cobrado or 0 for c in cobros)
    total_gastos = sum(g.monto_usd for g in gastos)
    resultado_neto = total_cobrado - total_gastos
    pendientes = len([c for c in cobros if c.estado == 'pendiente'])

    return {
        "total_esperado": round(total_esperado, 2),
        "total_cobrado": round(total_cobrado, 2),
        "total_gastos": round(total_gastos, 2),
        "resultado_neto": round(resultado_neto, 2),
        "cobros_pendientes": pendientes,
        "cobros_total": len(cobros),
    }