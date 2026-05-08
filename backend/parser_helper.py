import re
from datetime import datetime

def parsear_texto_financiacion(texto, fecha_base=None):
    movimientos = []

    def extraer_monto(fragmento):
        patrones = [
            r'DÓLARES[^(]*\([Uu]\$[Ss]\s*([\d\.]+)',
            r'DOLARES[^(]*\([Uu]\$[Ss]\s*([\d\.]+)',
            r'DÓLARES[^(]*\(USD\s*([\d\.]+)',
            r'DOLARES[^(]*\(USD\s*([\d\.]+)',
            r'[Uu]\$[Ss]\s*([\d\.]+)',
            r'USD\s*([\d\.]+)',
        ]
        for p in patrones:
            m = re.search(p, fragmento)
            if m:
                return float(m.group(1).replace('.', '').replace(',', '.'))
        return None

    def extraer_fecha(fragmento):
        if re.search(r'en\s+[eé]ste?\s+acto', fragmento, re.IGNORECASE):
            return None
        patrones = [
            r'(\d{2})/(\d{2})/(\d{2,4})',
            r'(\d{2})-(\d{2})-(\d{2,4})',
        ]
        for p in patrones:
            m = re.search(p, fragmento)
            if m:
                d, mo, y = m.group(1), m.group(2), m.group(3)
                if len(y) == 2:
                    y = '20' + y
                return f"{y}-{mo}-{d}"
        return None

    secciones = re.split(r'\b[a-z]\)', texto)

    for i, seccion in enumerate(secciones[1:], 1):
        seccion_lower = seccion.lower()
        monto = extraer_monto(seccion)
        if not monto:
            continue
        fecha = extraer_fecha(seccion)

        cuotas_match = re.search(
            r'(\d+)\s+cuotas?\s+(?:iguales?)?.+?(?:[Uu]\$[Ss]|USD)\s*([\d\.]+)',
            seccion, re.IGNORECASE
        )
        if cuotas_match:
            n_cuotas = int(cuotas_match.group(1))
            monto_cuota = float(cuotas_match.group(2).replace('.', '').replace(',', '.'))
            fragmento_fecha = seccion[cuotas_match.start():]
            fecha_primera = extraer_fecha(fragmento_fecha)
            if fecha_primera:
                from dateutil.relativedelta import relativedelta
                fecha_dt = datetime.strptime(fecha_primera, '%Y-%m-%d')
                for j in range(n_cuotas):
                    fecha_cuota = (fecha_dt + relativedelta(months=j)).strftime('%Y-%m-%d')
                    movimientos.append({
                        "tipo": "cuota",
                        "concepto": f"Cuota {j+1}/{n_cuotas}",
                        "fecha_vencimiento": fecha_cuota,
                        "monto_usd": monto_cuota,
                        "moneda": "USD"
                    })
            else:
                for j in range(n_cuotas):
                    movimientos.append({
                        "tipo": "cuota",
                        "concepto": f"Cuota {j+1}/{n_cuotas}",
                        "fecha_vencimiento": "",
                        "monto_usd": monto_cuota,
                        "moneda": "USD"
                    })
            continue

        es_refuerzo = any(k in seccion_lower for k in ['tenencia', 'escritura', 'refuerzo', 'entrega'])
        es_anticipo = any(k in seccion_lower for k in ['firma', 'contrato', 'primer pago', 'acto'])

        if es_refuerzo:
            movimientos.append({
                "tipo": "refuerzo",
                "concepto": "Refuerzo — entrega de tenencia",
                "fecha_vencimiento": fecha or "",
                "monto_usd": monto,
                "moneda": "USD"
            })
        elif es_anticipo:
            movimientos.append({
                "tipo": "anticipo",
                "concepto": "Anticipo — firma del contrato",
                "fecha_vencimiento": fecha or "",
                "monto_usd": monto,
                "moneda": "USD"
            })
        else:
            movimientos.append({
                "tipo": "refuerzo",
                "concepto": f"Pago {i}",
                "fecha_vencimiento": fecha or "",
                "monto_usd": monto,
                "moneda": "USD"
            })

    precio_compra = round(sum(m['monto_usd'] for m in movimientos), 2)

    propiedad = {}
    if precio_compra > 0:
        propiedad['precio_compra'] = precio_compra

    texto_lower = texto.lower()

    # Tipo de propiedad
    if 'lote' in texto_lower:
        propiedad['tipo'] = 'Lote'
    elif 'departamento' in texto_lower or 'depto' in texto_lower:
        propiedad['tipo'] = 'Departamento'
    elif 'casa' in texto_lower:
        propiedad['tipo'] = 'Casa'
    elif 'local' in texto_lower:
        propiedad['tipo'] = 'Local comercial'
    elif 'oficina' in texto_lower:
        propiedad['tipo'] = 'Oficina'
    elif 'campo' in texto_lower:
        propiedad['tipo'] = 'Campo'

    # Estado de obra
    if 'en pozo' in texto_lower:
        propiedad['estado_obra'] = 'en_pozo'
    elif 'en obra' in texto_lower or 'en construcción' in texto_lower:
        propiedad['estado_obra'] = 'en_obra'
    else:
        propiedad['estado_obra'] = 'terminado'

    # Fecha de entrega
    entrega_match = re.search(
        r'(?:entrega|finalizaci[oó]n|terminaci[oó]n)[^0-9]*(\d{2})[/\-](\d{2})[/\-](\d{2,4})',
        texto, re.IGNORECASE
    )
    if entrega_match:
        d, mo, y = entrega_match.group(1), entrega_match.group(2), entrega_match.group(3)
        if len(y) == 2: y = '20' + y
        propiedad['fecha_entrega'] = f"{y}-{mo}-{d}"

    # M2
    m2_match = re.search(r'(\d[\d\.]*)\s*metros?\s*cuadrados?', texto, re.IGNORECASE)
    if m2_match:
        propiedad['m2_cubiertos'] = float(m2_match.group(1).replace('.', ''))

    # Hectáreas
    ha_match = re.search(r'(\d[\d\.]*)\s*hect[aá]reas?', texto, re.IGNORECASE)
    if ha_match:
        propiedad['hectareas'] = float(ha_match.group(1).replace('.', ''))

    # UF
    uf_match = re.search(r'N[°º]?\s*(\d+)\)', texto)
    if uf_match:
        propiedad['uf'] = uf_match.group(1)

    # Nombre del emprendimiento
    emp_match = re.search(r'"([^"]+)"', texto)
    if emp_match:
        nombre_emp = emp_match.group(1)
        uf_num = propiedad.get('uf', '')
        propiedad['nombre'] = f"{nombre_emp} {uf_num}".strip()

    # Dirección de la PROPIEDAD
    dir_patterns = [
        r'(?:inmueble|propiedad|lote|unidad)[^,\.]{0,50}(?:calle|av\.|avenida|bv\.)\s+([^,]+(?:N[°º]?\s*\d+|\d+)[^,]{0,30})',
        r'(?:sito|ubicado|situado)\s+en\s+(?:calle\s+)?([^,]+(?:N[°º]?\s*\d+|\d+)[^,]{0,30})',
    ]
    for pat in dir_patterns:
        dir_match = re.search(pat, texto, re.IGNORECASE)
        if dir_match:
            direccion = dir_match.group(1).strip()
            direccion = re.split(r'\s+de\s+la\s+(?:ciudad|localidad)', direccion)[0].strip()
            direccion = re.split(r',\s*(?:ciudad|localidad|partido|provincia)', direccion)[0].strip()
            propiedad['direccion'] = direccion
            break

    # Localidad, Partido, Provincia y País
    loc_match = re.search(
        r'[Ll]ocalidad\s+de\s+([^,]+),\s*[Pp]artido\s+de\s+([^,]+),\s*[Pp]rovincia\s+de\s+([^,\.]+)',
        texto
    )
    if loc_match:
        localidad = loc_match.group(1).strip().split(' y ')[0].split(',')[0].strip()
        partido = loc_match.group(2).strip().split(',')[0].strip()
        provincia = loc_match.group(3).strip().split(',')[0].split(' y ')[0].strip()
        propiedad['ubicacion'] = localidad
        propiedad['partido'] = partido
        propiedad['provincia'] = provincia
        propiedad['pais'] = 'Argentina'
    else:
        loc2_match = re.search(
            r'(?:ciudad|localidad)\s+de\s+([^,]+),\s*[Pp]rovincia\s+de\s+([^,\.]+)',
            texto, re.IGNORECASE
        )
        if loc2_match:
            propiedad['ubicacion'] = loc2_match.group(1).strip()
            propiedad['provincia'] = loc2_match.group(2).strip().split(',')[0].strip()
            propiedad['pais'] = 'Argentina'

    # Comprador
    comprador_match = re.search(
        r'(?:señor|señora|sr\.|sra\.)\s+([A-ZÁÉÍÓÚ][a-záéíóú]+(?:\s+[A-ZÁÉÍÓÚ][a-záéíóú]+)*)',
        texto, re.IGNORECASE
    )
    if comprador_match:
        propiedad['comprador_nombre'] = comprador_match.group(1).strip()

    return {"movimientos": movimientos, "propiedad": propiedad}