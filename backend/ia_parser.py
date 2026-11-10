"""Lector de contratos con IA (API de Anthropic).

Manda el texto del contrato al modelo, recibe los datos en JSON y los convierte
al mismo formato que ya usaba el parser por reglas: {"movimientos": [...], "propiedad": {...}}.
Las fechas de las cuotas las calcula este código (no la IA), para que sean exactas.
"""
import os, json, re, asyncio
from datetime import datetime
import requests
from dateutil.relativedelta import relativedelta

API_URL = "https://api.anthropic.com/v1/messages"
MODELO = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5-5")

PROMPT = """Sos un asistente que lee boletos de compraventa inmobiliarios argentinos.
Devolvé SOLO un JSON válido (sin texto extra, sin markdown) con esta forma exacta:
{
  "tipo": "Lote|Departamento|Casa|Local comercial|Oficina|Campo|null",
  "nombre": "nombre del emprendimiento y número de unidad, o null",
  "direccion": "calle y número de la PROPIEDAD (nunca el domicilio del comprador o vendedor), o null",
  "localidad": "solo la localidad, o null",
  "partido": "solo el partido, o null",
  "provincia": "solo la provincia, o null",
  "pais": "país, por defecto Argentina",
  "comprador": "nombre y apellido del COMPRADOR, o null",
  "superficie_m2": numero o null,
  "hectareas": numero o null,
  "uf": "número de unidad funcional o null",
  "estado_obra": "en_pozo|en_obra|terminado",
  "fecha_contrato": "YYYY-MM-DD o null",
  "precio_total_usd": numero o null,
  "anticipo": {"monto_usd": numero, "fecha": "YYYY-MM-DD o null"} o null,
  "cuotas": {"cantidad": entero, "monto_usd": numero, "fecha_primera": "YYYY-MM-DD o null"} o null,
  "refuerzos": [{"concepto": "texto corto", "monto_usd": numero, "fecha": "YYYY-MM-DD o null"}]
}
Reglas: montos en dólares como número sin separadores de miles. Si un pago dice "en este acto", su fecha es la fecha del contrato.
Si una fecha no figura, poné null: NUNCA inventes ni uses la fecha de hoy. Si un dato no está, null."""


def _llamar_api(texto: str) -> dict:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("Falta ANTHROPIC_API_KEY")
    r = requests.post(
        API_URL,
        headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
        json={"model": MODELO, "max_tokens": 2000, "system": PROMPT,
              "messages": [{"role": "user", "content": texto[:60000]}]},
        timeout=60,
    )
    r.raise_for_status()
    salida = "".join(b.get("text", "") for b in r.json().get("content", []))
    m = re.search(r"\{.*\}", salida, re.DOTALL)
    return json.loads(m.group(0))


def _a_formato_app(d: dict) -> dict:
    movs = []
    if d.get("anticipo") and d["anticipo"].get("monto_usd"):
        a = d["anticipo"]
        movs.append({"tipo": "anticipo", "concepto": "Anticipo — firma del contrato",
                     "fecha_vencimiento": a.get("fecha") or d.get("fecha_contrato") or "",
                     "monto_usd": float(a["monto_usd"]), "moneda": "USD"})
    c = d.get("cuotas")
    if c and c.get("cantidad") and c.get("monto_usd"):
        n = int(c["cantidad"])
        primera = c.get("fecha_primera")
        base = datetime.strptime(primera, "%Y-%m-%d") if primera else None
        for j in range(n):
            f = (base + relativedelta(months=j)).strftime("%Y-%m-%d") if base else ""
            movs.append({"tipo": "cuota", "concepto": f"Cuota {j+1}/{n}",
                         "fecha_vencimiento": f, "monto_usd": float(c["monto_usd"]), "moneda": "USD"})
    for ref in d.get("refuerzos") or []:
        if ref.get("monto_usd"):
            movs.append({"tipo": "refuerzo", "concepto": ref.get("concepto") or "Refuerzo",
                         "fecha_vencimiento": ref.get("fecha") or "",
                         "monto_usd": float(ref["monto_usd"]), "moneda": "USD"})
    prop = {
        "precio_compra": round(sum(m["monto_usd"] for m in movs), 2) or d.get("precio_total_usd"),
        "tipo": d.get("tipo"), "nombre": d.get("nombre"), "direccion": d.get("direccion"),
        "ubicacion": d.get("localidad"), "partido": d.get("partido"), "provincia": d.get("provincia"),
        "pais": d.get("pais") or "Argentina", "comprador_nombre": d.get("comprador"),
        "m2_cubiertos": d.get("superficie_m2"), "hectareas": d.get("hectareas"), "uf": d.get("uf"),
        "estado_obra": d.get("estado_obra") or "terminado", "fecha_compra": d.get("fecha_contrato"),
    }
    prop = {k: v for k, v in prop.items() if v not in (None, "", "null")}
    return {"movimientos": movs, "propiedad": prop}


async def parsear_con_ia(texto: str) -> dict:
    datos = await asyncio.to_thread(_llamar_api, texto)
    return _a_formato_app(datos)
