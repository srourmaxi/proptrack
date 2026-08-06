import { useState, useEffect } from 'react'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import './App.css'

const API = 'https://proptrack-backend-wyqz.onrender.com'
const TASA_DEFAULT = 1

const GASTOS_ITEMS = [
{ key: 'comision', label: 'Comisión inmobiliaria' },
  { key: 'escribania', label: 'Escribanía' },
  { key: 'gestion', label: 'Gestión / trámites' },
  { key: 'certificados', label: 'Certificados' },
  { key: 'ganancias', label: 'Impuesto a las ganancias' },
  { key: 'sellado', label: 'Impuestos provinciales' },
  { key: 'plusvalia', label: 'Tasas municipales' },
  { key: 'otros', label: 'Otros' },
]

const INDICES = ['ICL','IPC','CasaPropia','CAC','CER','IS','IPIM','UVA','% Fijo']

function fmt(n) {
  if (n == null || n === '') return '—'
  const num = Math.round(Number(n))
  return 'USD ' + num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}
function fmtPct(n) {
  if (n == null) return '—'
  return (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%'
}
function fmtFecha(f) {
  if (!f) return '—'
  const [y, m, d] = f.split('-')
  if (!y || !m || !d) return f
  return `${d}/${m}/${y}`
}
function ordenarPorFecha(arr) {
  return [...arr].sort((a, b) => (a.fecha || a.fecha_desde || '').localeCompare(b.fecha || b.fecha_desde || ''))
}
function calcularM2Pond(c, s, d) {
  return ((parseFloat(c)||0)*1 + (parseFloat(s)||0)*0.5 + (parseFloat(d)||0)*0.2).toFixed(2)
}
function gastosTotalUSD(form, pre) {
  return GASTOS_ITEMS.reduce((s, g) => s + (parseFloat(form[`${pre}_${g.key}_usd`])||0), 0)
}
function getToken() { return localStorage.getItem('proptrack_token') }
function setToken(t) { localStorage.setItem('proptrack_token', t) }
function removeToken() { localStorage.removeItem('proptrack_token') }
function authHeaders() { return { Authorization: `Bearer ${getToken()}` } }

function colorVencimiento(fecha_vencimiento, pagado) {
  if (pagado || !fecha_vencimiento) return ''
  const hoy = new Date(); hoy.setHours(0,0,0,0)
  const vence = new Date(fecha_vencimiento + 'T00:00:00')
  const dias = Math.ceil((vence - hoy) / (1000*60*60*24))
  if (dias < 0) return 'venc-rojo'
  if (dias <= 1) return 'venc-naranja'
  if (dias <= 10) return 'venc-amarillo'
  return 'venc-azul'
}

function prepararDatos(form) {
  const datos = {
    nombre: form.nombre || null,
    tipo: form.tipo || null,
    direccion: form.direccion || null,
    ubicacion: form.ubicacion || null,
    m2_cubiertos: parseFloat(form.m2_cubiertos)||null,
    m2_semicubiertos: parseFloat(form.m2_semicubiertos)||null,
    m2_descubiertos: parseFloat(form.m2_descubiertos)||null,
    m2_ponderados: parseFloat(form.m2_ponderados)||null,
    hectareas: parseFloat(form.hectareas)||null,
    ambientes: parseInt(form.ambientes)||null,
    banos: parseInt(form.banos)||null,
    cochera: form.cochera||false,
    torre: form.torre||null,
    piso: form.piso||null,
    depto: form.depto||null,
    uf: form.uf||null,
    fecha_compra: form.fecha_compra||null,
    precio_compra: parseFloat(form.precio_compra)||0,
    notas: form.notas||null,
    estado_obra: form.estado_obra || 'terminado',
    fecha_entrega: form.fecha_entrega || null,
    valor_estimado_entrega: parseFloat(form.valor_estimado_entrega)||null,
    partido: form.partido || null,
    provincia: form.provincia || null,
    pais: form.pais || null,
    comprador_nombre: form.comprador_nombre || null,
    gc_monedas: JSON.stringify(form.gc_monedas||{}),
    gc_cotizaciones: JSON.stringify(form.gc_cotizaciones||{}),
    gv_monedas: JSON.stringify({}),
    gv_cotizaciones: JSON.stringify({}),
    vendida: false,
  }
  GASTOS_ITEMS.forEach(g => {
    datos[`gc_${g.key}`] = parseFloat(form[`gc_${g.key}`])||0
    datos[`gc_${g.key}_usd`] = parseFloat(form[`gc_${g.key}_usd`])||0
    datos[`gv_${g.key}`] = 0
    datos[`gv_${g.key}_usd`] = 0
  })
  return datos
}

async function calcularVP(movimientos, precioBase, fechaBase, tasa) {
  if (!movimientos.length || !precioBase) return null
  try {
    const res = await axios.post(`${API}/calcular-financiado`, {
      precio_contado: parseFloat(precioBase),
      fecha_base: fechaBase || new Date().toISOString().split('T')[0],
      tasa_mensual: tasa || TASA_DEFAULT,
      movimientos: movimientos.map(m=>({
        fecha_vencimiento: m.fecha_vencimiento || new Date().toISOString().split('T')[0],
        monto_usd: m.monto_usd
      }))
    }, {headers:authHeaders()})
    return res.data
  } catch(e) { return null }
}

function AuthScreen({ onLogin }) {
  const [modo, setModo] = useState('login')
  const [form, setForm] = useState({ nombre: '', email: '', password: '', codigo_invitacion: '' })
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function submit() {
    setError('')
    if (!form.email || !form.password) { setError('Completá email y contraseña'); return }
    if (modo === 'registro' && !form.nombre) { setError('Completá tu nombre'); return }
    if (modo === 'registro' && !form.codigo_invitacion) { setError('Ingresá tu código de invitación'); return }
    setCargando(true)
    try {
      if (modo === 'reset') {
        await axios.post(`${API}/auth/solicitar-reset`, { email: form.email })
        setError('')
        alert('Si el email existe, recibirás un correo con instrucciones.')
        setModo('login')
        setCargando(false)
        return
      }
      const url = modo === 'login' ? `${API}/auth/login` : `${API}/auth/registro`
      const res = await axios.post(url, form)
      setToken(res.data.token)
      onLogin({ nombre: res.data.nombre, email: res.data.email })
    } catch (e) {
      setError(e.response?.data?.detail || 'Error al conectar con el servidor')
    }
    setCargando(false)
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">🏠 PropTrack</div>
        <div className="auth-tabs">
          <button className={modo==='login'?'active':''} onClick={()=>setModo('login')}>Iniciar sesión</button>
          <button className={modo==='registro'?'active':''} onClick={()=>setModo('registro')}>Registrarse</button>
        </div>
        {modo==='registro' && (
          <>
            <label>Nombre</label>
            <input placeholder="Tu nombre" value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} />
            <label>Código de invitación</label>
            <input placeholder="Ingresá tu código de acceso" value={form.codigo_invitacion} onChange={e=>setForm({...form,codigo_invitacion:e.target.value})} />
          </>
        )}
        <label>Email</label>
        <input type="email" placeholder="tu@email.com" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} />
        <label>Contraseña</label>
        <input type="password" placeholder="••••••••" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} onKeyDown={e=>e.key==='Enter'&&submit()} />
        {error && <div className="auth-error">{error}</div>}
        <button className="btn-primary auth-submit" onClick={submit} disabled={cargando}>
          {cargando ? 'Cargando...' : modo==='login' ? 'Ingresar' : 'Crear cuenta'}
        </button>
        {modo==='login' && (
          <div style={{textAlign:'center',marginTop:'12px'}}>
            <button onClick={()=>setModo('reset')} style={{background:'transparent',border:'none',color:'#848e9c',fontSize:'13px',cursor:'pointer',textDecoration:'underline'}}>
              Olvidé mi contraseña
            </button>
          </div>
        )}
        {modo==='reset' && (
          <div style={{textAlign:'center',marginTop:'12px'}}>
            <button onClick={()=>setModo('login')} style={{background:'transparent',border:'none',color:'#848e9c',fontSize:'13px',cursor:'pointer',textDecoration:'underline'}}>
              ← Volver al login
            </button>
          </div>
        )}
        {modo==='registro' && (
          <div style={{marginTop:'16px',textAlign:'center'}}>
            <div style={{fontSize:'12px',color:'#848e9c',marginBottom:'10px'}}>
              ¿Necesitás un código de acceso?
            </div>
            <a href="https://api.whatsapp.com/send?phone=5491165694440&text=Hola%2C%20quiero%20acceder%20a%20PropTrack"
              target="_blank"
              rel="noopener noreferrer"
              style={{display:'inline-flex',alignItems:'center',gap:'8px',background:'#25D36622',color:'#25D366',border:'1px solid #25D36644',borderRadius:'8px',padding:'10px 20px',textDecoration:'none',fontSize:'14px',fontWeight:600}}
            >
              <span style={{fontSize:'18px'}}>💬</span> Solicitar acceso por WhatsApp
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
function SeccionGastos({ prefijo, form, onChange }) {
  function handleMonto(key, val) {
    const moneda = form[`${prefijo}_monedas`]?.[key] || 'USD'
    const cotiz = parseFloat(form[`${prefijo}_cotizaciones`]?.[key]) || 1
    let usd = moneda==='USD' ? parseFloat(val)||0 : cotiz>0 ? (parseFloat(val)||0)/cotiz : 0
    onChange(`${prefijo}_${key}`, val)
    onChange(`${prefijo}_${key}_usd`, usd.toFixed(2))
  }
  function handleMoneda(key, moneda) {
    const monedas = {...(form[`${prefijo}_monedas`]||{})}
    monedas[key] = moneda
    onChange(`${prefijo}_monedas`, monedas)
    const monto = parseFloat(form[`${prefijo}_${key}`])||0
    const cotiz = parseFloat(form[`${prefijo}_cotizaciones`]?.[key])||1
    const usd = moneda==='USD' ? monto : cotiz>0 ? monto/cotiz : 0
    onChange(`${prefijo}_${key}_usd`, usd.toFixed(2))
  }
  function handleCotiz(key, cotiz) {
    const cotizaciones = {...(form[`${prefijo}_cotizaciones`]||{})}
    cotizaciones[key] = cotiz
    onChange(`${prefijo}_cotizaciones`, cotizaciones)
    const monto = parseFloat(form[`${prefijo}_${key}`])||0
    const moneda = form[`${prefijo}_monedas`]?.[key] || 'USD'
    const usd = moneda==='USD' ? monto : parseFloat(cotiz)>0 ? monto/parseFloat(cotiz) : 0
    onChange(`${prefijo}_${key}_usd`, usd.toFixed(2))
  }
  const total = gastosTotalUSD(form, prefijo)
  return (
    <div className="gastos-seccion">
      {GASTOS_ITEMS.map(g => {
        const moneda = form[`${prefijo}_monedas`]?.[g.key] || 'USD'
        const monto = form[`${prefijo}_${g.key}`] || ''
        const cotiz = form[`${prefijo}_cotizaciones`]?.[g.key] || ''
        const usd = form[`${prefijo}_${g.key}_usd`] || 0
        return (
          <div key={g.key} className="gasto-row">
            <span className="gasto-label">{g.label}</span>
            <select value={moneda} onChange={e=>handleMoneda(g.key,e.target.value)} className="gasto-moneda">
              <option value="USD">USD</option>
              <option value="ARS">ARS</option>
              <option value="EUR">EUR</option>
              <option value="UVA">UVA</option>
            </select>
            <input type="number" placeholder="Monto" value={monto} onChange={e=>handleMonto(g.key,e.target.value)} className="gasto-monto" />
            {moneda!=='USD' && <input type="number" placeholder={moneda==='ARS'?'Cotiz. dólar':moneda==='EUR'?'Cotiz. EUR':'Cotiz. UVA'} value={cotiz} onChange={e=>handleCotiz(g.key,e.target.value)} className="gasto-cotiz" />}
            {monto && <span className="gasto-usd">{fmt(usd)}</span>}
          </div>
        )
      })}
      <div className="gasto-total"><span>Total gastos</span><strong>{fmt(total)}</strong></div>
    </div>
  )
}

function ParserContrato({ onMovimientos, onPropiedad }) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(false)
  const [preview, setPreview] = useState(null)
  const [propPreview, setPropPreview] = useState(null)
  const [error, setError] = useState('')

  async function parsear() {
    if (!texto.trim()) return
    setCargando(true)
    setError('')
    try {
      const res = await axios.post(`${API}/parsear-financiacion`, { texto }, { headers: authHeaders() })
      setPreview(res.data.movimientos || [])
      setPropPreview(res.data.propiedad || {})
    } catch (e) {
      setError('No se pudo interpretar el texto.')
    }
    setCargando(false)
  }

  function confirmar() {
    if (propPreview) onPropiedad(propPreview)
    onMovimientos(preview || [])
    setAbierto(false); setTexto(''); setPreview(null); setPropPreview(null)
  }

  const labels = {tipo:'Tipo',nombre:'Nombre',ubicacion:'Localidad',partido:'Partido',provincia:'Provincia',pais:'País',comprador_nombre:'Comprador',m2_cubiertos:'Superficie m²',hectareas:'Hectáreas',uf:'UF',precio_compra:'Precio de compra',fecha_compra:'Fecha de compra'}

  if (!abierto) return (
    <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
      <button className="btn-parser" onClick={()=>setAbierto(true)}>✨ Pegar texto del contrato</button>
      <button className="btn-parser" onClick={()=>document.getElementById('input-archivo-contrato').click()}>📎 Subir Word o PDF</button>
      <input id="input-archivo-contrato" type="file" accept=".docx,.pdf" style={{display:'none'}} onChange={async e=>{
        const file = e.target.files[0]
        if (!file) return
        setCargando(true)
        setError('')
        try {
          let textoExtraido = ''
          if (file.name.endsWith('.docx')) {
            const mammoth = await import('mammoth')
            const arrayBuffer = await file.arrayBuffer()
            const result = await mammoth.extractRawText({arrayBuffer})
            textoExtraido = result.value
          } else if (file.name.endsWith('.pdf')) {
            const pdfjsLib = await import('pdfjs-dist')
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js` 
            const arrayBuffer = await file.arrayBuffer()
            const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i)
              const content = await page.getTextContent()
              textoExtraido += content.items.map(item => item.str).join(' ') + '\n'
            }
          }
          if (textoExtraido.trim()) {
            setTexto(textoExtraido)
            setAbierto(true)
          } else {
            setError('No se pudo extraer texto del archivo.')
          }
        } catch(err) {
          setError('Error al leer el archivo. Probá con otro formato.')
        }
        setCargando(false)
        e.target.value = ''
      }} />
      {cargando && <span style={{fontSize:'13px',color:'#848e9c',alignSelf:'center'}}>Procesando archivo...</span>}
      {error && <div className="auth-error" style={{width:'100%'}}>{error}</div>}
    </div>
  )

  return (
    <div className="parser-box">
      <div className="parser-titulo">Pegá el texto del contrato</div>
      <textarea className="parser-textarea" placeholder="Pegá acá el texto legal completo..." value={texto} onChange={e=>setTexto(e.target.value)} rows={6} />
      {error && <div className="auth-error">{error}</div>}
      <div className="botones">
        <button className="btn-primary" onClick={parsear} disabled={cargando}>{cargando?'Analizando...':'Analizar texto'}</button>
        <button onClick={()=>{setAbierto(false);setTexto('');setPreview(null);setPropPreview(null)}}>Cancelar</button>
      </div>
      {propPreview && Object.keys(propPreview).length > 0 && (
        <div className="parser-preview">
          <div className="parser-preview-titulo">Datos detectados — editables</div>
          <div className="prop-preview-grid">
            {Object.keys(labels).map(k => (
              propPreview[k] !== undefined && propPreview[k] !== null && (
                <div key={k} className="prop-preview-item">
                  <span>{labels[k]}</span>
                  <input value={propPreview[k]} onChange={e=>setPropPreview({...propPreview,[k]:e.target.value})}
                    type={['m2_cubiertos','hectareas','precio_compra'].includes(k)?'number':'text'} />
                </div>
              )
            ))}
          </div>
        </div>
      )}
      {preview && preview.length > 0 && (
        <div className="parser-preview">
          <div className="parser-preview-titulo">Forma de pago — revisá y confirmá</div>
          {preview.map((m, i) => (
            <div key={i} className={`parser-preview-row ${colorVencimiento(m.fecha_vencimiento, false)}`}>
              <span className={`fin-badge fin-${m.tipo}`}>{m.tipo}</span>
              <input value={m.concepto} onChange={e=>{const p=[...preview];p[i]={...p[i],concepto:e.target.value};setPreview(p)}} />
              <input type="date" value={m.fecha_vencimiento||''} onChange={e=>{const p=[...preview];p[i]={...p[i],fecha_vencimiento:e.target.value};setPreview(p)}} />
              <input type="number" value={m.monto_usd} onChange={e=>{const p=[...preview];p[i]={...p[i],monto_usd:parseFloat(e.target.value)||0};setPreview(p)}} style={{width:'90px'}} />
              <button className="danger small" onClick={()=>setPreview(preview.filter((_,j)=>j!==i))}>✕</button>
            </div>
          ))}
          <div className="parser-total">Total: <strong>{fmt(preview.reduce((s,m)=>s+(m.monto_usd||0),0))}</strong></div>
          <button className="btn-primary" style={{marginTop:'8px'}} onClick={confirmar}>✓ Confirmar e importar</button>
        </div>
      )}
      {preview && preview.length===0 && <div className="aviso">No se detectaron movimientos. Cargá manualmente.</div>}
    </div>
  )
}

function SeccionFinanciacion({ operacion, movimientos, onAgregar, onConfirmar, onEliminar, precioBase, fechaBase, tasaInicial }) {
  const [nuevo, setNuevo] = useState({tipo:'anticipo',concepto:'',fecha_vencimiento:'',monto:'',moneda:'USD',cotizacion:'',monto_usd:''})
  const [tasaRef, setTasaRef] = useState(tasaInicial || TASA_DEFAULT)
  const [calculado, setCalculado] = useState(null)

  useEffect(()=>{
    if (movimientos.length > 0 && precioBase) calcular()
  },[movimientos.length, precioBase])

  async function calcular() {
    const res = await calcularVP(movimientos, precioBase, fechaBase, tasaRef)
    if (res) setCalculado(res)
  }

  function handleMontoNuevo(val) {
    const cotiz = parseFloat(nuevo.cotizacion)||1
    const usd = nuevo.moneda==='USD' ? parseFloat(val)||0 : cotiz>0 ? (parseFloat(val)||0)/cotiz : 0
    setNuevo(n=>({...n,monto:val,monto_usd:usd.toFixed(2)}))
  }
  function handleMonedaNuevo(moneda) {
    const monto = parseFloat(nuevo.monto)||0
    const cotiz = parseFloat(nuevo.cotizacion)||1
    const usd = moneda==='USD' ? monto : cotiz>0 ? monto/cotiz : 0
    setNuevo(n=>({...n,moneda,monto_usd:usd.toFixed(2)}))
  }
  function handleCotizNuevo(val) {
    const monto = parseFloat(nuevo.monto)||0
    const usd = nuevo.moneda==='USD' ? monto : parseFloat(val)>0 ? monto/parseFloat(val) : 0
    setNuevo(n=>({...n,cotizacion:val,monto_usd:usd.toFixed(2)}))
  }

  const totalNominal = movimientos.reduce((s,m)=>s+(m.monto_usd||0),0)
  const totalPagado = movimientos.filter(m=>m.pagado).reduce((s,m)=>s+(m.monto_usd||0),0)
  const pendiente = totalNominal-totalPagado
  const labelTipo = {anticipo:'Anticipo',cuota:'Cuota',refuerzo:'Refuerzo'}

  return (
    <div className="financiacion">
      {movimientos.length>0 && (
        <div className="fin-resumen">
          <div className="fin-stat"><span>Total nominal</span><strong>{fmt(totalNominal)}</strong></div>
          <div className="fin-stat"><span>Pagado</span><strong className="verde">{fmt(totalPagado)}</strong></div>
          <div className="fin-stat"><span>Pendiente</span><strong className={pendiente>0?'amarillo':'verde'}>{fmt(pendiente)}</strong></div>
        </div>
      )}
      {movimientos.map(m => {
        const color = colorVencimiento(m.fecha_vencimiento, m.pagado)
        return (
          <div key={m.id} className={`fin-row ${m.pagado?'pagado':''} ${color}`}>
            <div className="fin-row-info">
              <span className={`fin-badge fin-${m.tipo}`}>{labelTipo[m.tipo]}</span>
              <span className="fin-concepto">{m.concepto}</span>
              {m.fecha_vencimiento && <span className="fin-fecha">Vence: {fmtFecha(m.fecha_vencimiento)}</span>}
              {m.pagado && <span className="fin-fecha verde">Pagado: {fmtFecha(m.fecha_pago)}</span>}
            </div>
            <div className="fin-row-monto"><strong>{fmt(m.monto_usd)}</strong></div>
            <div className="fin-row-actions">
              {!m.pagado ? (
                <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
                  <input type="date" defaultValue={new Date().toISOString().split('T')[0]}
                    id={`fecha-pago-${m.id}`} style={{width:'130px',fontSize:'12px',padding:'4px 6px'}} />
                  <button className="btn-pagar" onClick={()=>{
                    const fecha = document.getElementById(`fecha-pago-${m.id}`)?.value || new Date().toISOString().split('T')[0]
                    onConfirmar(m.id, true, fecha)
                  }}>✓ Confirmar</button>
                </div>
              ) : (
                <button className="btn-despagar" onClick={()=>onConfirmar(m.id,false,null)}>↩ Revertir</button>
              )}
              <button className="danger small" onClick={()=>onEliminar(m.id)}>✕</button>
            </div>
          </div>
        )
      })}
      <div className="fin-nuevo">
        <div className="fin-nuevo-row">
          <select value={nuevo.tipo} onChange={e=>setNuevo(n=>({...n,tipo:e.target.value}))}>
            <option value="anticipo">Anticipo</option>
            <option value="cuota">Cuota</option>
            <option value="refuerzo">Refuerzo</option>
          </select>
          <input placeholder="Concepto" value={nuevo.concepto} onChange={e=>setNuevo(n=>({...n,concepto:e.target.value}))} />
          <input type="date" value={nuevo.fecha_vencimiento} onChange={e=>setNuevo(n=>({...n,fecha_vencimiento:e.target.value}))} />
        </div>
        <div className="fin-nuevo-row">
          <select value={nuevo.moneda} onChange={e=>handleMonedaNuevo(e.target.value)}>
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
            <option value="EUR">EUR</option>
            <option value="UVA">UVA</option>
          </select>
          <input type="number" placeholder="Monto" value={nuevo.monto} onChange={e=>handleMontoNuevo(e.target.value)} />
          {nuevo.moneda!=='USD' && <input type="number" placeholder={nuevo.moneda==='ARS'?'Cotiz. dólar':nuevo.moneda==='EUR'?'Cotiz. EUR':'Cotiz. UVA'} value={nuevo.cotizacion} onChange={e=>handleCotizNuevo(e.target.value)} />}
          <span className="gasto-usd">{nuevo.monto_usd?fmt(nuevo.monto_usd):''}</span>
          <button onClick={()=>{
            if(!nuevo.fecha_vencimiento||!nuevo.monto){alert('Completá fecha y monto');return}
            onAgregar({...nuevo,operacion,monto_usd:parseFloat(nuevo.monto_usd)||0,cotizacion:parseFloat(nuevo.cotizacion)||1})
            setNuevo({tipo:'anticipo',concepto:'',fecha_vencimiento:'',monto:'',moneda:'USD',cotizacion:'',monto_usd:''})
          }}>+ Agregar</button>
        </div>
      </div>
      {movimientos.length>0 && precioBase && (
        <div className="calculador-fin">
          <div className="calc-titulo">
            {operacion==='compra'?'Valor presente de la financiación':'Simulador de precio financiado'}
          </div>
          <div className="calc-nota-texto">
            {operacion==='compra'
              ?'El VP te dice cuánto estás pagando realmente hoy descontando el valor tiempo del dinero.'
              :'Calculá el precio de lista financiado equivalente a tu precio contado objetivo.'}
          </div>
          <div className="calc-row">
            <label>Tasa mensual (%)</label>
            <input type="number" step="0.1" value={tasaRef} onChange={e=>setTasaRef(parseFloat(e.target.value)||TASA_DEFAULT)} style={{width:'80px'}} />
            <button onClick={calcular}>Recalcular</button>
          </div>
          {calculado && (
            <>
              <div className="calc-resultado">
                {operacion==='compra' ? (<>
                  <div className="calc-item"><span>Total nominal</span><strong>{fmt(totalNominal)}</strong></div>
                  <div className="calc-item"><span>Valor presente</span><strong className="amarillo">{fmt(calculado.valor_presente_total)}</strong></div>
                  <div className="calc-item destacado"><span>Costo real entrada</span><strong className="verde">{fmt(calculado.valor_presente_total)}</strong></div>
                  <div className="calc-item"><span>Ahorro vs nominal</span><strong className="verde">{fmt(totalNominal-calculado.valor_presente_total)}</strong></div>
                </>) : (<>
                  <div className="calc-item"><span>Precio contado base</span><strong>{fmt(precioBase)}</strong></div>
                  <div className="calc-item"><span>VP de cuotas</span><strong className="amarillo">{fmt(calculado.valor_presente_total)}</strong></div>
                  <div className="calc-item"><span>Costo financiero</span><strong className="rojo">{fmt(calculado.costo_financiero)}</strong></div>
                  <div className="calc-item destacado"><span>Precio lista sugerido</span><strong className="verde">{fmt(calculado.precio_financiado_sugerido)}</strong></div>
                </>)}
              </div>
              <div className="calc-detalle">
                {calculado.detalle.slice(0,5).map((d,i) => (
                  <div key={i} className="calc-detalle-row">
                    <span>{fmtFecha(d.fecha)}</span>
                    <span>{fmt(d.monto_nominal)}</span>
                    <span className="nota">{d.meses}m → VP: {fmt(d.valor_presente)}</span>
                  </div>
                ))}
                {calculado.detalle.length > 5 && <div className="calc-detalle-row"><span className="nota">... y {calculado.detalle.length-5} más</span></div>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function FormAlquiler({ prop, onCancelar }) {
  const [tab, setTab] = useState('contrato')
  const [form, setForm] = useState({
    monto: '', moneda: 'USD', cotizacion_usd: '',
    periodo_actualizacion: 6, indice_actualizacion: 'ICL',
    porcentaje_fijo: '', inquilino: '', notas: '',
  })
  const [resultado, setResultado] = useState(null)
  const [alquileres, setAlquileres] = useState([])
  const [alquilerActivo, setAlquilerActivo] = useState(null)
  const [cobros, setCobros] = useState([])
  const [gastos, setGastos] = useState([])
  const [resumen, setResumen] = useState(null)
  const [nuevoCobro, setNuevoCobro] = useState({ periodo: '', monto_esperado: '', monto_cobrado: '', fecha_cobro: '', estado: 'pendiente', notas: '' })
  const [nuevoGasto, setNuevoGasto] = useState({ tipo: 'Impuesto inmobiliario', descripcion: '', monto: '', moneda: 'USD', cotizacion_usd: '', fecha: '', periodo: '', notas: '' })
  const TIPOS_GASTO = ['Impuesto inmobiliario', 'Mantenimiento', 'Expensas', 'Seguro', 'Reparación', 'Administración', 'Otros']

  useEffect(() => { cargarAlquileres() }, [prop.id])
  useEffect(() => { if (alquilerActivo) cargarAdminDatos() }, [alquilerActivo])

  async function cargarAlquileres() {
    const r = await axios.get(`${API}/alquileres/${prop.id}`, { headers: authHeaders() })
    setAlquileres(r.data)
    if (r.data.length > 0) setAlquilerActivo(r.data[r.data.length - 1])
  }

  async function cargarAdminDatos() {
    const [c, g, rs] = await Promise.all([
      axios.get(`${API}/cobros/${prop.id}`, { headers: authHeaders() }),
      axios.get(`${API}/gastos-alquiler/${prop.id}`, { headers: authHeaders() }),
      axios.get(`${API}/resumen-alquiler/${prop.id}`, { headers: authHeaders() }),
    ])
    setCobros(c.data); setGastos(g.data); setResumen(rs.data)
  }

  function cambiar(key, val) { setForm(f => ({ ...f, [key]: val })) }

  useEffect(() => { if (form.monto) calcular() }, [form.monto, form.moneda, form.cotizacion_usd, form.periodo_actualizacion, form.indice_actualizacion])

  async function calcular() {
    if (!form.monto) return
    try {
      const res = await axios.post(`${API}/calcular-alquiler`, {
        propiedad_id: prop.id,
        fecha_inicio: new Date().toISOString().split('T')[0],
        monto: parseFloat(form.monto) || 0,
        moneda: form.moneda,
        cotizacion_usd: parseFloat(form.cotizacion_usd) || 1,
        periodo_actualizacion: parseInt(form.periodo_actualizacion) || 6,
        indice_actualizacion: form.indice_actualizacion,
        porcentaje_fijo: parseFloat(form.porcentaje_fijo) || null,
      }, { headers: authHeaders() })
      setResultado(res.data)
    } catch (e) { }
  }

  async function guardarContrato() {
    if (!form.monto) { alert('Ingresá el monto del alquiler'); return }
    const monto_usd = form.moneda === 'USD' ? parseFloat(form.monto) : (parseFloat(form.monto) / (parseFloat(form.cotizacion_usd) || 1))
    const r = await axios.post(`${API}/alquileres`, {
      propiedad_id: prop.id,
      fecha_desde: new Date().toISOString().split('T')[0],
      monto_usd, inquilino: form.inquilino || null, notas: form.notas || null,
    }, { headers: authHeaders() })
    setAlquilerActivo(r.data); cargarAlquileres(); setTab('admin')
  }

  async function agregarCobro() {
    if (!nuevoCobro.periodo || !nuevoCobro.monto_esperado) { alert('Completá período y monto esperado'); return }
    await axios.post(`${API}/cobros`, {
      alquiler_id: alquilerActivo.id, propiedad_id: prop.id,
      periodo: nuevoCobro.periodo,
      monto_esperado: parseFloat(nuevoCobro.monto_esperado),
      monto_cobrado: parseFloat(nuevoCobro.monto_cobrado) || 0,
      fecha_cobro: nuevoCobro.fecha_cobro || null,
      estado: nuevoCobro.estado, notas: nuevoCobro.notas || null,
    }, { headers: authHeaders() })
    setNuevoCobro({ periodo: '', monto_esperado: '', monto_cobrado: '', fecha_cobro: '', estado: 'pendiente', notas: '' })
    cargarAdminDatos()
  }

  async function confirmarCobro(id, monto) {
    const hoy = new Date().toISOString().split('T')[0]
    await axios.put(`${API}/cobros/${id}`, { estado: 'cobrado', fecha_cobro: hoy, monto_cobrado: monto }, { headers: authHeaders() })
    cargarAdminDatos()
  }

  async function eliminarCobro(id) {
    if (confirm('¿Eliminar?')) { await axios.delete(`${API}/cobros/${id}`, { headers: authHeaders() }); cargarAdminDatos() }
  }

  async function agregarGasto() {
    if (!nuevoGasto.monto || !nuevoGasto.tipo) { alert('Completá tipo y monto'); return }
    const cotiz = parseFloat(nuevoGasto.cotizacion_usd) || 1
    const monto_usd = nuevoGasto.moneda === 'USD' ? parseFloat(nuevoGasto.monto) : parseFloat(nuevoGasto.monto) / cotiz
    await axios.post(`${API}/gastos-alquiler`, {
      alquiler_id: alquilerActivo?.id || 0, propiedad_id: prop.id,
      periodo: nuevoGasto.periodo || null, tipo: nuevoGasto.tipo,
      descripcion: nuevoGasto.descripcion || null,
      monto: parseFloat(nuevoGasto.monto), moneda: nuevoGasto.moneda,
      cotizacion_usd: cotiz, monto_usd,
      fecha: nuevoGasto.fecha || null, notas: nuevoGasto.notas || null,
    }, { headers: authHeaders() })
    setNuevoGasto({ tipo: 'Impuesto inmobiliario', descripcion: '', monto: '', moneda: 'USD', cotizacion_usd: '', fecha: '', periodo: '', notas: '' })
    cargarAdminDatos()
  }

  async function eliminarGasto(id) {
    if (confirm('¿Eliminar?')) { await axios.delete(`${API}/gastos-alquiler/${id}`, { headers: authHeaders() }); cargarAdminDatos() }
  }

  const estadoColor = { cobrado: 'verde', pendiente: 'amarillo', parcial: 'naranja' }

  return (
    <div className="formulario" style={{ maxWidth: '800px' }}>
      <h2>Alquilar · {prop.nombre}</h2>
      <div className="admin-tabs">
        <button className={tab==='contrato'?'active':''} onClick={()=>setTab('contrato')}>Contrato</button>
        <button className={tab==='admin'?'active':''} onClick={()=>setTab('admin')}>Administración</button>
      </div>

      {tab==='contrato' && (<>
        <div className="form-section">
          <div className="form-section-title">Condiciones del alquiler</div>
          <div className="form-row-3">
            <div><label>Monto mensual</label><input type="number" placeholder="Ej: 500" value={form.monto} onChange={e=>cambiar('monto',e.target.value)} /></div>
            <div><label>Moneda</label>
              <select value={form.moneda} onChange={e=>cambiar('moneda',e.target.value)}>
                <option value="USD">USD</option><option value="ARS">ARS</option><option value="EUR">EUR</option>
              </select>
            </div>
            {form.moneda!=='USD' && <div><label>Cotización dólar</label><input type="number" placeholder="Ej: 1200" value={form.cotizacion_usd} onChange={e=>cambiar('cotizacion_usd',e.target.value)} /></div>}
          </div>
          <div className="form-row-2">
            <div><label>Período de actualización (meses)</label>
              <select value={form.periodo_actualizacion} onChange={e=>cambiar('periodo_actualizacion',e.target.value)}>
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(n=><option key={n} value={n}>{n} {n===1?'mes':'meses'}</option>)}
              </select>
            </div>
            <div><label>Índice de actualización</label>
              <select value={form.indice_actualizacion} onChange={e=>cambiar('indice_actualizacion',e.target.value)}>
                {INDICES.map(i=><option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          </div>
          {form.indice_actualizacion==='% Fijo' && <div className="form-row-2"><div><label>Porcentaje (%)</label><input type="number" value={form.porcentaje_fijo} onChange={e=>cambiar('porcentaje_fijo',e.target.value)} /></div></div>}
          <div className="form-row-2"><div><label>Inquilino</label><input placeholder="Nombre" value={form.inquilino} onChange={e=>cambiar('inquilino',e.target.value)} /></div></div>
          <label>Notas</label>
          <textarea placeholder="Notas opcionales" value={form.notas} onChange={e=>cambiar('notas',e.target.value)} />
        </div>
        {resultado && (
          <div className="form-section">
            <div className="form-section-title">Proyección</div>
            <div className="roi-cards">
              <div className="roi-card"><span>Alquiler mensual</span><strong>{fmt(resultado.monto_mensual_usd)}</strong></div>
              <div className="roi-card"><span>Renta anual</span><strong>{fmt(resultado.renta_anual_usd)}</strong></div>
              <div className="roi-card verde-bg"><span>Yield anual</span><strong>{resultado.yield_anual?.toFixed(2)}%</strong></div>
              <div className="roi-card"><span>Recupero del capital</span><strong>{resultado.anos_recupero?resultado.anos_recupero.toFixed(1)+' años':'—'}</strong></div>
              <div className="roi-card"><span>Actualización</span><strong>c/{resultado.periodo_actualizacion}m · {resultado.indice_actualizacion}</strong></div>
            </div>
          </div>
        )}
        <div className="botones">
          <button className="btn-primary" onClick={guardarContrato}>Registrar contrato</button>
          <button className="danger" onClick={onCancelar}>Cancelar</button>
        </div>
      </>)}

      {tab==='admin' && (<>
        {resumen && (
          <div className="form-section">
            <div className="form-section-title">Resumen</div>
            <div className="roi-cards">
              <div className="roi-card"><span>Total esperado</span><strong>{fmt(resumen.total_esperado)}</strong></div>
              <div className="roi-card verde-bg"><span>Total cobrado</span><strong>{fmt(resumen.total_cobrado)}</strong></div>
              <div className="roi-card"><span>Total gastos</span><strong className="rojo">{fmt(resumen.total_gastos)}</strong></div>
              <div className={`roi-card ${resumen.resultado_neto>=0?'verde-bg':'rojo-bg'}`}>
                <span>Resultado neto</span>
                <strong className={resumen.resultado_neto>=0?'verde':'rojo'}>{fmt(resumen.resultado_neto)}</strong>
              </div>
              <div className="roi-card"><span>Cobros pendientes</span><strong className="amarillo">{resumen.cobros_pendientes}</strong></div>
            </div>
          </div>
        )}
        <div className="form-section">
          <div className="form-section-title">Cobros mensuales</div>
          {cobros.length===0 && <p className="vacio-small">Sin cobros registrados.</p>}
          {cobros.map(c=>(
            <div key={c.id} className="admin-row">
              <div className="admin-row-info">
                <span className={`admin-badge ${estadoColor[c.estado]||''}`}>{c.estado}</span>
                <span className="fin-concepto" style={{marginLeft:'8px'}}>{c.periodo}</span>
                {c.fecha_cobro&&<span className="fin-fecha" style={{marginLeft:'8px'}}>· Cobrado: {fmtFecha(c.fecha_cobro)}</span>}
              </div>
              <div className="admin-row-montos">
                <span className="nota">Esperado: {fmt(c.monto_esperado)}</span>
                <span className="nota">Cobrado: <strong className={c.estado==='cobrado'?'verde':'amarillo'}>{c.monto_cobrado?fmt(c.monto_cobrado):'—'}</strong></span>
              </div>
              <div className="fin-row-actions">
                {c.estado!=='cobrado'&&<button className="btn-pagar" onClick={()=>confirmarCobro(c.id,c.monto_esperado)}>✓ Cobrado</button>}
                <button className="danger small" onClick={()=>eliminarCobro(c.id)}>✕</button>
              </div>
            </div>
          ))}
          <div className="admin-nuevo">
            <div className="form-section-title" style={{marginBottom:'10px'}}>Registrar cobro</div>
            <div className="form-row-3">
              <div><label>Período (MM/AAAA)</label><input placeholder="04/2024" value={nuevoCobro.periodo} onChange={e=>setNuevoCobro({...nuevoCobro,periodo:e.target.value})} /></div>
              <div><label>Monto esperado USD</label><input type="number" value={nuevoCobro.monto_esperado} onChange={e=>setNuevoCobro({...nuevoCobro,monto_esperado:e.target.value})} /></div>
              <div><label>Monto cobrado USD</label><input type="number" value={nuevoCobro.monto_cobrado} onChange={e=>setNuevoCobro({...nuevoCobro,monto_cobrado:e.target.value})} /></div>
            </div>
            <div className="form-row-3">
              <div><label>Fecha cobro</label><input type="date" value={nuevoCobro.fecha_cobro} onChange={e=>setNuevoCobro({...nuevoCobro,fecha_cobro:e.target.value})} /></div>
              <div><label>Estado</label>
                <select value={nuevoCobro.estado} onChange={e=>setNuevoCobro({...nuevoCobro,estado:e.target.value})}>
                  <option value="pendiente">Pendiente</option>
                  <option value="cobrado">Cobrado</option>
                  <option value="parcial">Parcial</option>
                </select>
              </div>
              <div style={{display:'flex',alignItems:'flex-end'}}>
                <button className="btn-primary" style={{width:'100%'}} onClick={agregarCobro}>+ Agregar</button>
              </div>
            </div>
          </div>
        </div>
        <div className="form-section">
          <div className="form-section-title">Gastos del período</div>
          {gastos.length===0 && <p className="vacio-small">Sin gastos registrados.</p>}
          {gastos.map(g=>(
            <div key={g.id} className="admin-row">
              <div className="admin-row-info">
                <span className="fin-badge fin-refuerzo">{g.tipo}</span>
                <span className="fin-concepto" style={{marginLeft:'8px'}}>{g.descripcion||g.tipo}</span>
                {g.periodo&&<span className="fin-fecha" style={{marginLeft:'8px'}}>· {g.periodo}</span>}
                {g.fecha&&<span className="fin-fecha" style={{marginLeft:'8px'}}>· {fmtFecha(g.fecha)}</span>}
              </div>
              <div className="admin-row-montos">
                {g.moneda!=='USD'&&<span className="nota">{g.moneda} {Number(g.monto).toLocaleString()}</span>}
                {g.moneda!=='USD'&&<span className="nota">≈ <strong className="rojo">{fmt(g.monto_usd)}</strong></span>}
                {g.moneda==='USD'&&<strong className="rojo">{fmt(g.monto_usd)}</strong>}
              </div>
              <div className="fin-row-actions">
                <button className="danger small" onClick={()=>eliminarGasto(g.id)}>✕</button>
              </div>
            </div>
          ))}
          <div className="admin-nuevo">
            <div className="form-section-title" style={{marginBottom:'10px'}}>Registrar gasto</div>
            <div className="form-row-3">
              <div><label>Tipo</label>
                <select value={nuevoGasto.tipo} onChange={e=>setNuevoGasto({...nuevoGasto,tipo:e.target.value})}>
                  {TIPOS_GASTO.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div><label>Descripción</label><input placeholder="Detalle" value={nuevoGasto.descripcion} onChange={e=>setNuevoGasto({...nuevoGasto,descripcion:e.target.value})} /></div>
              <div><label>Período (MM/AAAA)</label><input placeholder="04/2024" value={nuevoGasto.periodo} onChange={e=>setNuevoGasto({...nuevoGasto,periodo:e.target.value})} /></div>
            </div>
            <div className="form-row-3">
              <div><label>Moneda</label>
                <select value={nuevoGasto.moneda} onChange={e=>setNuevoGasto({...nuevoGasto,moneda:e.target.value})}>
                  <option value="USD">USD</option><option value="ARS">ARS</option><option value="EUR">EUR</option>
                </select>
              </div>
              <div><label>Monto</label><input type="number" placeholder="Ej: 5000" value={nuevoGasto.monto} onChange={e=>setNuevoGasto({...nuevoGasto,monto:e.target.value})} /></div>
              {nuevoGasto.moneda!=='USD'&&<div><label>Cotiz. dólar</label><input type="number" value={nuevoGasto.cotizacion_usd} onChange={e=>setNuevoGasto({...nuevoGasto,cotizacion_usd:e.target.value})} /></div>}
              <div><label>Fecha</label><input type="date" value={nuevoGasto.fecha} onChange={e=>setNuevoGasto({...nuevoGasto,fecha:e.target.value})} /></div>
            </div>
            <div style={{marginTop:'8px'}}>
              <button className="btn-primary" onClick={agregarGasto}>+ Registrar gasto</button>
            </div>
          </div>
        </div>
        <div className="botones"><button onClick={onCancelar}>← Volver</button></div>
      </>)}
    </div>
  )
}

function FormPropiedad({ inicial, onGuardar, onCancelar }) {
  const initGastos = (pre) => {
    const obj = {}
    GASTOS_ITEMS.forEach(g => {
      obj[`${pre}_${g.key}`] = inicial?.[`${pre}_${g.key}`]||''
      obj[`${pre}_${g.key}_usd`] = inicial?.[`${pre}_${g.key}_usd`]||0
    })
    obj[`${pre}_monedas`] = inicial?.[`${pre}_monedas`]
      ? (typeof inicial[`${pre}_monedas`]==='string' ? JSON.parse(inicial[`${pre}_monedas`]) : inicial[`${pre}_monedas`]) : {}
    obj[`${pre}_cotizaciones`] = inicial?.[`${pre}_cotizaciones`]
      ? (typeof inicial[`${pre}_cotizaciones`]==='string' ? JSON.parse(inicial[`${pre}_cotizaciones`]) : inicial[`${pre}_cotizaciones`]) : {}
    return obj
  }

  const [form, setForm] = useState({
    nombre:inicial?.nombre||'', tipo:inicial?.tipo||'',
    direccion:inicial?.direccion||'', ubicacion:inicial?.ubicacion||'',
    m2_cubiertos:inicial?.m2_cubiertos||'', m2_semicubiertos:inicial?.m2_semicubiertos||'',
    m2_descubiertos:inicial?.m2_descubiertos||'', m2_ponderados:inicial?.m2_ponderados||'',
    hectareas:inicial?.hectareas||'', ambientes:inicial?.ambientes||'',
    banos:inicial?.banos||'', cochera:inicial?.cochera||false,
    torre:inicial?.torre||'', piso:inicial?.piso||'', depto:inicial?.depto||'', uf:inicial?.uf||'',
    fecha_compra:inicial?.fecha_compra||'', precio_compra:inicial?.precio_compra||'',
    estado_obra:inicial?.estado_obra||'terminado', fecha_entrega:inicial?.fecha_entrega||'',
    valor_estimado_entrega:inicial?.valor_estimado_entrega||'',
    partido:inicial?.partido||'', provincia:inicial?.provincia||'',
    pais:inicial?.pais||'Argentina', comprador_nombre:inicial?.comprador_nombre||'',
    notas:inicial?.notas||'',
    ...initGastos('gc'),
  })
  const [movCompra, setMovCompra] = useState([])

  useEffect(()=>{
    if (inicial?.id) {
      axios.get(`${API}/movimientos/${inicial.id}`,{headers:authHeaders()})
        .then(r=>setMovCompra(r.data.filter(m=>m.operacion==='compra')))
    }
  },[inicial])

  function cambiar(key, val) {
    setForm(f=>{
      const n={...f,[key]:val}
      if(['m2_cubiertos','m2_semicubiertos','m2_descubiertos'].includes(key)){
        n.m2_ponderados=calcularM2Pond(
          key==='m2_cubiertos'?val:n.m2_cubiertos,
          key==='m2_semicubiertos'?val:n.m2_semicubiertos,
          key==='m2_descubiertos'?val:n.m2_descubiertos
        )
      }
      return n
    })
  }

  function completarDesdeParser(datos) {
    setForm(f => {
      const nuevo = {...f}
      Object.entries(datos).forEach(([k,v]) => {
        if (v !== null && v !== undefined && v !== '') nuevo[k] = String(v)
      })
      return nuevo
    })
  }

  async function agregarMovCompra(data) {
    if (inicial?.id) {
      const r = await axios.post(`${API}/movimientos`,{...data,propiedad_id:inicial.id},{headers:authHeaders()})
      setMovCompra(m=>[...m,r.data])
    } else {
      setMovCompra(m=>[...m,{...data,id:Date.now()}])
    }
  }
  async function confirmarMovCompra(id, pagado, fecha_pago) {
    const hoy = fecha_pago || new Date().toISOString().split('T')[0]
    await axios.put(`${API}/movimientos/${id}/pagar`,{pagado,fecha_pago:pagado?hoy:null},{headers:authHeaders()})
    setMovCompra(m=>m.map(x=>x.id===id?{...x,pagado,fecha_pago:pagado?hoy:null}:x))
  }
  async function eliminarMovCompra(id) {
    if(inicial?.id) await axios.delete(`${API}/movimientos/${id}`,{headers:authHeaders()})
    setMovCompra(m=>m.filter(x=>x.id!==id))
  }

  function guardar() {
    if(!form.nombre){alert('El nombre es obligatorio');return}
    onGuardar(prepararDatos(form), movCompra)
  }

  const tipo=form.tipo
  const esDepto=tipo==='Departamento',esCasa=tipo==='Casa',esLote=tipo==='Lote'
  const esCampo=tipo==='Campo',esLocal=tipo==='Local comercial',esOficina=tipo==='Oficina'
  const tieneM2=esDepto||esCasa||esLocal||esOficina
  const costoEntrada=(parseFloat(form.precio_compra)||0)+gastosTotalUSD(form,'gc')

  return (
    <div className="formulario">
      <h2>{inicial?'Editar propiedad':'Nueva propiedad'}</h2>
      <div className="form-section">
        <div className="form-section-title">Importar desde contrato</div>
        <ParserContrato
          onMovimientos={async movs => {
            for (const m of movs) await agregarMovCompra({...m, operacion:'compra', cotizacion:m.cotizacion||1})
          }}
          onPropiedad={completarDesdeParser}
        />
      </div>
      <div className="form-section">
        <div className="form-section-title">Datos generales</div>
        <label>Nombre</label>
        <input placeholder="Ej: Lote BC-14" value={form.nombre} onChange={e=>cambiar('nombre',e.target.value)} />
        <label>Tipo de propiedad</label>
        <select value={form.tipo} onChange={e=>cambiar('tipo',e.target.value)}>
          <option value="">Seleccioná un tipo</option>
          <option value="Departamento">Departamento</option>
          <option value="Casa">Casa</option>
          <option value="Lote">Lote</option>
          <option value="Local comercial">Local comercial</option>
          <option value="Oficina">Oficina</option>
          <option value="Campo">Campo</option>
          <option value="Otro">Otro</option>
        </select>
        <label>Dirección</label>
        <input placeholder="Ej: Av. del Libertador 1234" value={form.direccion} onChange={e=>cambiar('direccion',e.target.value)} />
        <label>Localidad</label>
        <input placeholder="Ej: Guillermo Hudson" value={form.ubicacion} onChange={e=>cambiar('ubicacion',e.target.value)} />
        <div className="form-row-3">
          <div><label>Partido</label><input placeholder="Ej: Berazategui" value={form.partido||''} onChange={e=>cambiar('partido',e.target.value)} /></div>
          <div><label>Provincia</label><input placeholder="Ej: Buenos Aires" value={form.provincia||''} onChange={e=>cambiar('provincia',e.target.value)} /></div>
          <div><label>País</label><input placeholder="Argentina" value={form.pais||'Argentina'} onChange={e=>cambiar('pais',e.target.value)} /></div>
        </div>
        <label>Nombre y apellido del comprador</label>
        <input placeholder="Ej: Juan Pérez" value={form.comprador_nombre||''} onChange={e=>cambiar('comprador_nombre',e.target.value)} />
        <label>Estado de obra</label>
        <div className="form-row-3">
          <div>
            <select value={form.estado_obra} onChange={e=>cambiar('estado_obra',e.target.value)}>
              <option value="terminado">Terminado</option>
              <option value="en_obra">En obra</option>
              <option value="en_pozo">En pozo</option>
            </select>
          </div>
          {(form.estado_obra==='en_obra'||form.estado_obra==='en_pozo') && (<>
            <div>
              <label>Fecha de entrega</label>
              <input type="date" value={form.fecha_entrega||''} onChange={e=>cambiar('fecha_entrega',e.target.value)} />
            </div>
            <div>
              <label>Valor estimado a la entrega (USD)</label>
              <input type="number" placeholder="Ej: 85000" value={form.valor_estimado_entrega||''} onChange={e=>cambiar('valor_estimado_entrega',e.target.value)} />
            </div>
          </>)}
        </div>
      </div>

      {tipo && (
        <div className="form-section">
          <div className="form-section-title">Características</div>
          {esDepto && (<>
            <div className="form-row-3">
              <div><label>Torre</label><input placeholder="Ej: A" value={form.torre} onChange={e=>cambiar('torre',e.target.value)} /></div>
              <div><label>Piso</label><input placeholder="Ej: 4" value={form.piso} onChange={e=>cambiar('piso',e.target.value)} /></div>
              <div><label>Depto</label><input placeholder="Ej: 4B" value={form.depto} onChange={e=>cambiar('depto',e.target.value)} /></div>
            </div>
            <div className="form-row-3">
              <div><label>Ambientes</label><input type="number" value={form.ambientes} onChange={e=>cambiar('ambientes',e.target.value)} /></div>
              <div><label>Baños</label><input type="number" value={form.banos} onChange={e=>cambiar('banos',e.target.value)} /></div>
              <div><label>Cochera</label><select value={form.cochera} onChange={e=>cambiar('cochera',e.target.value==='true')}><option value="false">No</option><option value="true">Sí</option></select></div>
            </div>
          </>)}
          {esCasa && (
            <div className="form-row-3">
              <div><label>Ambientes</label><input type="number" value={form.ambientes} onChange={e=>cambiar('ambientes',e.target.value)} /></div>
              <div><label>Baños</label><input type="number" value={form.banos} onChange={e=>cambiar('banos',e.target.value)} /></div>
              <div><label>Cochera</label><select value={form.cochera} onChange={e=>cambiar('cochera',e.target.value==='true')}><option value="false">No</option><option value="true">Sí</option></select></div>
            </div>
          )}
          {(esLocal||esOficina) && <div className="form-row-2"><div><label>UF</label><input placeholder="Ej: 42" value={form.uf} onChange={e=>cambiar('uf',e.target.value)} /></div></div>}
          {tieneM2 && (<>
            <div className="form-row-3">
              <div><label>M² cubiertos</label><input type="number" value={form.m2_cubiertos} onChange={e=>cambiar('m2_cubiertos',e.target.value)} /></div>
              <div><label>M² semicubiertos</label><input type="number" value={form.m2_semicubiertos} onChange={e=>cambiar('m2_semicubiertos',e.target.value)} /></div>
              <div><label>M² descubiertos</label><input type="number" value={form.m2_descubiertos} onChange={e=>cambiar('m2_descubiertos',e.target.value)} /></div>
            </div>
            <div className="m2-ponderados">M² ponderados: <strong>{form.m2_ponderados||0}</strong><span className="nota"> (×1 + ×0.5 + ×0.2)</span></div>
          </>)}
          {esLote && <div className="form-row-2"><div><label>Superficie (m²)</label><input type="number" value={form.m2_cubiertos} onChange={e=>cambiar('m2_cubiertos',e.target.value)} /></div></div>}
          {esCampo && <div className="form-row-2"><div><label>Hectáreas</label><input type="number" value={form.hectareas} onChange={e=>cambiar('hectareas',e.target.value)} /></div></div>}
        </div>
      )}

      <div className="form-section">
        <div className="form-section-title">Datos de compra</div>
        <div className="form-row-2">
          <div><label>Fecha de compra</label><input type="date" value={form.fecha_compra} onChange={e=>cambiar('fecha_compra',e.target.value)} /></div>
          <div><label>Precio de compra (USD)</label><input type="number" placeholder="Se completa desde el contrato" value={form.precio_compra} onChange={e=>cambiar('precio_compra',e.target.value)} /></div>
        </div>
        {!form.precio_compra && <div className="aviso">💡 El precio se calcula automáticamente al importar el contrato.</div>}
      </div>

      <div className="form-section">
        <div className="form-section-title">Gastos de compra</div>
        <SeccionGastos prefijo="gc" form={form} onChange={cambiar} />
        <div className="costo-entrada"><span>Costo total de entrada</span><strong>{fmt(costoEntrada)}</strong><span className="nota"> = precio + gastos</span></div>
      </div>

      <div className="form-section">
        <div className="form-section-title">Financiación de compra</div>
        <SeccionFinanciacion
          operacion="compra"
          movimientos={movCompra}
          onAgregar={agregarMovCompra}
          onConfirmar={confirmarMovCompra}
          onEliminar={eliminarMovCompra}
          precioBase={form.precio_compra}
          fechaBase={form.fecha_compra}
          tasaInicial={TASA_DEFAULT}
        />
      </div>

      <div className="form-section">
        <div className="form-section-title">Notas</div>
        <textarea placeholder="Notas opcionales" value={form.notas} onChange={e=>cambiar('notas',e.target.value)} />
      </div>

      <div className="botones">
        <button className="btn-primary" onClick={guardar}>{inicial?'Guardar cambios':'Guardar propiedad'}</button>
        <button className="danger" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  )
}

function FormVenta({ prop, onGuardar, onCancelar }) {
  const initGastos = () => {
    const obj={gv_monedas:{},gv_cotizaciones:{}}
    GASTOS_ITEMS.forEach(g=>{obj[`gv_${g.key}`]='';obj[`gv_${g.key}_usd`]=0})
    return obj
  }
  const [form,setForm] = useState({fecha_venta:'',precio_venta:'',...initGastos()})
  const [movVenta,setMovVenta] = useState([])

  function cambiar(key,val){setForm(f=>({...f,[key]:val}))}

  async function agregarMovVenta(data){
    const r=await axios.post(`${API}/movimientos`,{...data,propiedad_id:prop.id},{headers:authHeaders()})
    setMovVenta(m=>[...m,r.data])
  }
  async function confirmarMovVenta(id,pagado,fecha_pago){
    const hoy=fecha_pago||new Date().toISOString().split('T')[0]
    await axios.put(`${API}/movimientos/${id}/pagar`,{pagado,fecha_pago:pagado?hoy:null},{headers:authHeaders()})
    setMovVenta(m=>m.map(x=>x.id===id?{...x,pagado,fecha_pago:pagado?hoy:null}:x))
  }
  async function eliminarMovVenta(id){
    await axios.delete(`${API}/movimientos/${id}`,{headers:authHeaders()})
    setMovVenta(m=>m.filter(x=>x.id!==id))
  }

  const totalGastosVenta=gastosTotalUSD(form,'gv')
  const ingresoNeto=(parseFloat(form.precio_venta)||0)-totalGastosVenta

  function guardar(){
    if(!form.fecha_venta||!form.precio_venta){alert('Fecha y precio son obligatorios');return}
    const datosVenta = {
      ...prop, vendida:true,
      fecha_venta:form.fecha_venta,
      precio_venta:parseFloat(form.precio_venta),
      gv_monedas:JSON.stringify(form.gv_monedas||{}),
      gv_cotizaciones:JSON.stringify(form.gv_cotizaciones||{}),
      gc_monedas:prop.gc_monedas||'{}',
      gc_cotizaciones:prop.gc_cotizaciones||'{}',
    }
    GASTOS_ITEMS.forEach(g=>{
      datosVenta[`gv_${g.key}`]=parseFloat(form[`gv_${g.key}`])||0
      datosVenta[`gv_${g.key}_usd`]=parseFloat(form[`gv_${g.key}_usd`])||0
    })
    onGuardar(datosVenta)
  }

  return (
    <div className="formulario">
      <h2>Registrar venta · {prop.nombre}</h2>
      <div className="form-section">
        <div className="form-section-title">Datos de venta</div>
        <div className="form-row-2">
          <div><label>Fecha de venta</label><input type="date" value={form.fecha_venta} onChange={e=>cambiar('fecha_venta',e.target.value)} /></div>
          <div><label>Precio de venta (USD)</label><input type="number" placeholder="Ej: 85000" value={form.precio_venta} onChange={e=>cambiar('precio_venta',e.target.value)} /></div>
        </div>
      </div>
      <div className="form-section">
        <div className="form-section-title">Gastos de venta</div>
        <SeccionGastos prefijo="gv" form={form} onChange={cambiar} />
        <div className="costo-entrada">
          <span>Ingreso neto de venta</span>
          <strong className={ingresoNeto>=0?'verde':'rojo'}>{fmt(ingresoNeto)}</strong>
          <span className="nota"> = precio − gastos</span>
        </div>
      </div>
      <div className="form-section">
        <div className="form-section-title">Importar forma de pago de venta</div>
        <ParserContrato
          onMovimientos={async movs => {
            for (const m of movs) await agregarMovVenta({...m, operacion:'venta', cotizacion:m.cotizacion||1})
          }}
          onPropiedad={()=>{}}
        />
      </div>
      <div className="form-section">
        <div className="form-section-title">Financiación de venta</div>
        <SeccionFinanciacion operacion="venta" movimientos={movVenta} onAgregar={agregarMovVenta} onConfirmar={confirmarMovVenta} onEliminar={eliminarMovVenta} precioBase={form.precio_venta} fechaBase={form.fecha_venta} tasaInicial={TASA_DEFAULT} />
      </div>
      <div className="botones">
        <button className="btn-primary" onClick={guardar}>Confirmar venta</button>
        <button className="danger" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  )
}

function FilaPropiedad({ p, onVer, onEditar, onEliminar, onVender, onAlquilar }) {
  const [roi, setRoi] = useState(null)
  const gc=GASTOS_ITEMS.reduce((t,g)=>t+(p[`gc_${g.key}_usd`]||0),0)
  const costoEntrada=(p.precio_compra||0)+gc
  useEffect(()=>{
    axios.get(`${API}/roi/${p.id}`,{headers:authHeaders()}).then(r=>setRoi(r.data)).catch(()=>{})
  },[p.id])
  return (
    <div className={`fila-prop ${p.vendida?'vendida':''}`}>
      <div className="fila-info">
        <span className="tarjeta-tipo" style={{fontSize:'10px',padding:'2px 7px'}}>{p.tipo}</span>
        <span className="fila-nombre">{p.nombre}</span>
        {p.ubicacion&&<span className="fila-ubicacion">📍 {p.ubicacion}</span>}
        {p.vendida&&<span className="badge-vendida" style={{fontSize:'10px'}}>VENDIDA</span>}
      </div>
      <div className="fila-nums">
        <div className="fila-num"><span>Entrada</span><strong>{fmt(costoEntrada)}</strong></div>
        {p.vendida&&p.precio_venta&&<div className="fila-num"><span>Venta</span><strong>{fmt(p.precio_venta)}</strong></div>}
        {roi&&<div className="fila-num"><span>Ganancia</span><strong className={roi.ganancia_total>=0?'verde':'rojo'}>{fmt(roi.ganancia_total)}</strong></div>}
        {roi&&<div className="fila-num"><span>ROI</span><strong className={roi.roi_porcentaje>=0?'verde':'rojo'}>{fmtPct(roi.roi_porcentaje)}</strong></div>}
        {roi&&roi.roi_anual&&<div className="fila-num"><span>ROI anual</span><strong className={roi.roi_anual>=0?'verde':'rojo'}>{fmtPct(roi.roi_anual)}</strong></div>}
      </div>
      <div className="fila-acciones">
        <button onClick={()=>onVer(p)}>Ver</button>
        <button onClick={()=>onEditar(p)}>Editar</button>
        {!p.vendida&&<button className="btn-venta" onClick={()=>onVender(p)}>Vender</button>}
        {!p.vendida&&<button className="btn-alquilar" onClick={()=>onAlquilar(p)}>Alquilar</button>}
        <button className="danger" onClick={()=>onEliminar(p.id)}>✕</button>
      </div>
    </div>
  )
}

function TarjetaPropiedad({ p, onVer, onEditar, onEliminar, onVender, onAlquilar }) {
  const [roi, setRoi] = useState(null)
  const gc=GASTOS_ITEMS.reduce((t,g)=>t+(p[`gc_${g.key}_usd`]||0),0)
  const costoEntrada=(p.precio_compra||0)+gc
  const mapsUrl=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((p.direccion||'')+' '+(p.ubicacion||''))}`
  useEffect(()=>{
    axios.get(`${API}/roi/${p.id}`,{headers:authHeaders()}).then(r=>setRoi(r.data)).catch(()=>{})
  },[p.id])
  function subtitulo(){
    const pts=[]
    if(p.tipo==='Departamento'){if(p.torre)pts.push(`Torre ${p.torre}`);if(p.piso)pts.push(`Piso ${p.piso}`);if(p.depto)pts.push(`Depto ${p.depto}`)}
    if(p.ambientes)pts.push(`${p.ambientes} amb.`)
    if(p.banos)pts.push(`${p.banos} baños`)
    if(p.cochera)pts.push('cochera')
    if(p.tipo==='Lote'||p.tipo==='Campo'){if(p.m2_cubiertos)pts.push(`${p.m2_cubiertos} m²`);if(p.hectareas)pts.push(`${p.hectareas} ha`)}
    else if(p.m2_ponderados)pts.push(`${p.m2_ponderados} m²`)
    else if(p.m2_cubiertos)pts.push(`${p.m2_cubiertos} m²`)
    return pts.join(' · ')
  }
  return (
    <div className={`tarjeta ${p.vendida?'vendida':''}`}>
      <div className="tarjeta-header">
        <span className="tarjeta-tipo">{p.tipo}</span>
        {p.vendida&&<span className="badge-vendida">VENDIDA</span>}
      </div>
      <h2>{p.nombre}</h2>
      {subtitulo()&&<p className="tarjeta-sub">{subtitulo()}</p>}
      {(p.direccion||p.ubicacion)&&(
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="tarjeta-dir">
          📍 {p.direccion}{p.direccion&&p.ubicacion?', ':''}{p.ubicacion}
        </a>
      )}
      <div className="tarjeta-nums">
        <div><span>Costo entrada</span><strong>{fmt(costoEntrada)}</strong></div>
        {p.vendida&&p.precio_venta&&<div><span>Precio venta</span><strong>{fmt(p.precio_venta)}</strong></div>}
        {roi&&roi.valor_m2&&<div><span>USD/m²</span><strong>{fmt(roi.valor_m2)}</strong></div>}
        {roi&&<div><span>Ganancia</span><strong className={roi.ganancia_total>=0?'verde':'rojo'}>{fmt(roi.ganancia_total)}</strong></div>}
        {roi&&<div><span>ROI</span><strong className={roi.roi_porcentaje>=0?'verde':'rojo'}>{fmtPct(roi.roi_porcentaje)}</strong></div>}
        {roi&&roi.roi_anual&&<div><span>ROI anual</span><strong className={roi.roi_anual>=0?'verde':'rojo'}>{fmtPct(roi.roi_anual)}</strong></div>}
      </div>
      <div className="botones">
        <button onClick={()=>onVer(p)}>Ver detalle</button>
        <button onClick={()=>onEditar(p)}>Editar</button>
        {!p.vendida&&<button className="btn-venta" onClick={()=>onVender(p)}>Vender</button>}
        {!p.vendida&&<button className="btn-alquilar" onClick={()=>onAlquilar(p)}>Alquilar</button>}
        <button className="danger" onClick={()=>onEliminar(p.id)}>Eliminar</button>
      </div>
    </div>
  )
}

function Inicio({ propiedades, onVer, onEditar, onEliminar, onVender, onAlquilar }) {
  const [vistaLista, setVistaLista] = useState(false)
  const activas=propiedades.filter(p=>!p.vendida)
  const vendidas=propiedades.filter(p=>p.vendida)
  const totalInvertido=activas.reduce((s,p)=>s+(p.precio_compra||0)+GASTOS_ITEMS.reduce((t,g)=>t+(p[`gc_${g.key}_usd`]||0),0),0)
  const gananciaRealizada=vendidas.reduce((s,p)=>{
    const gc=GASTOS_ITEMS.reduce((t,g)=>t+(p[`gc_${g.key}_usd`]||0),0)
    const gv=GASTOS_ITEMS.reduce((t,g)=>t+(p[`gv_${g.key}_usd`]||0),0)
    return s+((p.precio_venta||0)-gv)-((p.precio_compra||0)+gc)
  },0)

  if(propiedades.length===0) return (
    <div className="vacio">
      <p>No tenés propiedades cargadas todavía.</p>
      <p>Hacé clic en <strong>+ Nueva propiedad</strong> para empezar.</p>
    </div>
  )

  return (
    <div>
      <div className="vista-toggle">
        <button className={!vistaLista?'active':''} onClick={()=>setVistaLista(false)} title="Vista grilla">⊞</button>
        <button className={vistaLista?'active':''} onClick={()=>setVistaLista(true)} title="Vista lista">☰</button>
      </div>
      {activas.length>0&&(<>
        <div className="seccion-titulo">Cartera activa</div>
        {!vistaLista
          ? <div className="grilla">{activas.map(p=><TarjetaPropiedad key={p.id} p={p} onVer={onVer} onEditar={onEditar} onEliminar={onEliminar} onVender={onVender} onAlquilar={onAlquilar}/>)}</div>
          : <div className="lista">{activas.map(p=><FilaPropiedad key={p.id} p={p} onVer={onVer} onEditar={onEditar} onEliminar={onEliminar} onVender={onVender} onAlquilar={onAlquilar}/>)}</div>
        }
      </>)}
      {vendidas.length>0&&(<>
        <div className="seccion-titulo" style={{marginTop:'32px'}}>Operaciones cerradas</div>
        {!vistaLista
          ? <div className="grilla">{vendidas.map(p=><TarjetaPropiedad key={p.id} p={p} onVer={onVer} onEditar={onEditar} onEliminar={onEliminar} onVender={onVender} onAlquilar={onAlquilar}/>)}</div>
          : <div className="lista">{vendidas.map(p=><FilaPropiedad key={p.id} p={p} onVer={onVer} onEditar={onEditar} onEliminar={onEliminar} onVender={onVender} onAlquilar={onAlquilar}/>)}</div>
        }
      </>)}
      <div className="resumen-footer">
        <div className="resumen-item"><span>Propiedades activas</span><strong>{activas.length}</strong></div>
        <div className="resumen-item"><span>Total invertido</span><strong>{fmt(totalInvertido)}</strong></div>
        <div className="resumen-item"><span>Operaciones cerradas</span><strong>{vendidas.length}</strong></div>
        <div className="resumen-item"><span>Ganancia realizada</span><strong className={gananciaRealizada>=0?'verde':'rojo'}>{fmt(gananciaRealizada)}</strong></div>
      </div>
    </div>
  )
}

function Detalle({ prop, onVolver, onEditar, onVender, onAlquilar }) {
  const [roi,setRoi] = useState(null)
  const [valuaciones,setValuaciones] = useState([])
  const [alquileres,setAlquileres] = useState([])
  const [movimientos,setMovimientos] = useState([])
  const [nuevaVal,setNuevaVal] = useState({fecha:'',valor_usd:''})
  const [nuevoAlq,setNuevoAlq] = useState({fecha_desde:'',fecha_hasta:'',monto_usd:'',inquilino:''})

  useEffect(()=>{cargarDatos()},[prop.id])

  async function cargarDatos(){
    const [r,v,a,m]=await Promise.all([
      axios.get(`${API}/roi/${prop.id}`,{headers:authHeaders()}),
      axios.get(`${API}/valuaciones/${prop.id}`,{headers:authHeaders()}),
      axios.get(`${API}/alquileres/${prop.id}`,{headers:authHeaders()}),
      axios.get(`${API}/movimientos/${prop.id}`,{headers:authHeaders()}),
    ])
    setRoi(r.data);setValuaciones(ordenarPorFecha(v.data))
    setAlquileres(ordenarPorFecha(a.data));setMovimientos(m.data)
  }

  async function agregarValuacion(){
    if(!nuevaVal.fecha||!nuevaVal.valor_usd){alert('Completá fecha y valor');return}
    await axios.post(`${API}/valuaciones`,{...nuevaVal,propiedad_id:prop.id,valor_usd:parseFloat(nuevaVal.valor_usd)},{headers:authHeaders()})
    setNuevaVal({fecha:'',valor_usd:''});cargarDatos()
  }
  async function eliminarValuacion(id){if(confirm('¿Eliminar?')){await axios.delete(`${API}/valuaciones/${id}`,{headers:authHeaders()});cargarDatos()}}
  async function agregarAlquiler(){
    if(!nuevoAlq.fecha_desde||!nuevoAlq.monto_usd){alert('Completá fecha y monto');return}
    await axios.post(`${API}/alquileres`,{...nuevoAlq,propiedad_id:prop.id,monto_usd:parseFloat(nuevoAlq.monto_usd)},{headers:authHeaders()})
    setNuevoAlq({fecha_desde:'',fecha_hasta:'',monto_usd:'',inquilino:''});cargarDatos()
  }
  async function eliminarAlquiler(id){if(confirm('¿Eliminar?')){await axios.delete(`${API}/alquileres/${id}`,{headers:authHeaders()});cargarDatos()}}
  async function confirmarMov(id,pagado,fecha_pago){
    const hoy=fecha_pago||new Date().toISOString().split('T')[0]
    await axios.put(`${API}/movimientos/${id}/pagar`,{pagado,fecha_pago:pagado?hoy:null},{headers:authHeaders()})
    cargarDatos()
  }
  async function eliminarMov(id){await axios.delete(`${API}/movimientos/${id}`,{headers:authHeaders()});cargarDatos()}

  const mapsUrl=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((prop.direccion||'')+' '+(prop.ubicacion||''))}`
  const inversion=roi?.costo_entrada||prop.precio_compra||0
  const datosGrafico=valuaciones.map(v=>{
    const g=inversion>0?parseFloat(((v.valor_usd-inversion)/inversion*100).toFixed(2)):0
    return {fecha:fmtFecha(v.fecha),valor:v.valor_usd,roi:g}
  })
  const ultimaVal=valuaciones[valuaciones.length-1]
  const hoy=new Date().toISOString().split('T')[0]
  const valorNote=ultimaVal?(ultimaVal.fecha<hoy?`Al ${fmtFecha(ultimaVal.fecha)}`:'Al día de hoy'):'Sin valuaciones'

  function subtitulo(){
    const pts=[]
    if(prop.tipo==='Departamento'){if(prop.torre)pts.push(`Torre ${prop.torre}`);if(prop.piso)pts.push(`Piso ${prop.piso}`);if(prop.depto)pts.push(`Depto ${prop.depto}`)}
    if(prop.ambientes)pts.push(`${prop.ambientes} ambientes`)
    if(prop.banos)pts.push(`${prop.banos} baños`)
    if(prop.cochera)pts.push('cochera')
    if(prop.uf)pts.push(`UF ${prop.uf}`)
    if(prop.tipo==='Lote'||prop.tipo==='Campo'){if(prop.m2_cubiertos)pts.push(`${prop.m2_cubiertos} m²`);if(prop.hectareas)pts.push(`${prop.hectareas} ha`)}
    else if(prop.m2_ponderados)pts.push(`${prop.m2_ponderados} m² pond.`)
    return pts.join(' · ')
  }

  const movCompra=movimientos.filter(m=>m.operacion==='compra')
  const movVenta=movimientos.filter(m=>m.operacion==='venta')
  const m2 = prop.tipo==='Lote' ? prop.m2_cubiertos : (prop.m2_ponderados||prop.m2_cubiertos)

  return (
    <div className="detalle">
      <div className="detalle-header">
        <button onClick={onVolver}>← Volver</button>
        <div style={{display:'flex',gap:'8px'}}>
          {!prop.vendida&&<button className="btn-alquilar" onClick={()=>onAlquilar(prop)}>Alquilar</button>}
          {!prop.vendida&&<button className="btn-venta" onClick={()=>onVender(prop)}>Registrar venta</button>}
          <button onClick={onEditar}>✏️ Editar</button>
        </div>
      </div>
      <div className="detalle-titulo">
        <span className="tarjeta-tipo">{prop.tipo}</span>
        {prop.vendida&&<span className="badge-vendida" style={{marginLeft:'8px'}}>VENDIDA</span>}
        <h2>{prop.nombre}</h2>
        {subtitulo()&&<p className="subtitulo">{subtitulo()}</p>}
        {(prop.direccion||prop.ubicacion)&&(
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="tarjeta-dir">
            📍 {prop.direccion}{prop.direccion&&prop.ubicacion?', ':''}{prop.ubicacion}
          </a>
        )}
      </div>

      {roi&&(
        <div className="roi-bloques">

          <div className="roi-bloque roi-bloque-gris">
            <div className="roi-bloque-titulo">Compra</div>
            <div className="roi-cards">
              <div className="roi-card"><span>Costo de entrada</span><strong>{fmt(roi.costo_entrada)}</strong><small className="nota">precio + gastos</small></div>
              {m2&&<div className="roi-card"><span>Superficie</span><strong>{m2} m²</strong></div>}
              {prop.hectareas&&<div className="roi-card"><span>Hectáreas</span><strong>{prop.hectareas} ha</strong></div>}
              {roi.usd_m2_compra&&<div className="roi-card"><span>USD/m² compra</span><strong>{fmt(roi.usd_m2_compra)}</strong></div>}
              {roi.usd_ha_compra&&<div className="roi-card"><span>USD/ha compra</span><strong>{fmt(roi.usd_ha_compra)}</strong></div>}
              {roi.gastos_compra>0&&<div className="roi-card"><span>Gastos de compra</span><strong>{fmt(roi.gastos_compra)}</strong></div>}
            </div>
          </div>

          {roi.valor_estimado_entrega&&(
            <div className="roi-bloque roi-bloque-violeta">
              <div className="roi-bloque-titulo">Proyección a la entrega</div>
              <div className="roi-cards">
                <div className="roi-card"><span>Valor estimado</span><strong>{fmt(roi.valor_estimado_entrega)}</strong><small className="nota">{prop.fecha_entrega?fmtFecha(prop.fecha_entrega):''}</small></div>
                {m2&&<div className="roi-card"><span>USD/m² entrega</span><strong>{fmt(Math.round(roi.valor_estimado_entrega/m2))}</strong></div>}
                <div className="roi-card roi-card-destacado roi-card-violeta"><span>Ganancia proyectada</span><strong className="verde">{fmt(roi.ganancia_estimada_entrega)}</strong></div>
                <div className="roi-card roi-card-destacado roi-card-violeta"><span>ROI proyectado</span><strong className="verde">{fmtPct(roi.roi_estimado_entrega)}</strong></div>
              </div>
            </div>
          )}

          <div className="roi-bloque roi-bloque-verde">
            <div className="roi-bloque-titulo">Valor de mercado actual</div>
            <div className="roi-cards">
              <div className="roi-card"><span>Valor actual</span><strong>{fmt(roi.valor_actual)}</strong><small className="nota">{valorNote}</small></div>
              {roi.valor_m2&&<div className="roi-card"><span>USD/m² actual</span><strong>{fmt(roi.valor_m2)}</strong></div>}
              {roi.valor_ha&&<div className="roi-card"><span>USD/ha actual</span><strong>{fmt(roi.valor_ha)}</strong></div>}
              <div className="roi-card"><span>Renta acumulada</span><strong>{fmt(roi.renta_acumulada)}</strong></div>
              <div className="roi-card roi-card-destacado roi-card-verde"><span>Ganancia de capital</span><strong className={roi.ganancia_capital>=0?'verde':'rojo'}>{fmt(roi.ganancia_capital)}</strong></div>
              <div className="roi-card roi-card-destacado roi-card-verde"><span>Ganancia total</span><strong className={roi.ganancia_total>=0?'verde':'rojo'}>{fmt(roi.ganancia_total)}</strong></div>
              <div className="roi-card roi-card-destacado roi-card-verde"><span>ROI total</span><strong className={roi.roi_porcentaje>=0?'verde':'rojo'}>{fmtPct(roi.roi_porcentaje)}</strong></div>
              {roi.roi_anual&&<div className="roi-card roi-card-destacado roi-card-verde"><span>ROI anual</span><strong className={roi.roi_anual>=0?'verde':'rojo'}>{fmtPct(roi.roi_anual)}</strong><small className="nota">en {roi.meses_operacion} meses</small></div>}
            </div>
          </div>

          {prop.vendida&&(
            <div className="roi-bloque roi-bloque-azul">
              <div className="roi-bloque-titulo">Venta</div>
              <div className="roi-cards">
                <div className="roi-card"><span>Precio de venta</span><strong>{fmt(prop.precio_venta)}</strong><small className="nota">{fmtFecha(prop.fecha_venta)}</small></div>
                {roi.ingreso_neto_venta&&<div className="roi-card"><span>Ingreso neto</span><strong>{fmt(roi.ingreso_neto_venta)}</strong><small className="nota">venta − gastos</small></div>}
                {roi.usd_m2_venta&&<div className="roi-card"><span>USD/m² venta</span><strong>{fmt(roi.usd_m2_venta)}</strong></div>}
                {roi.usd_ha_venta&&<div className="roi-card"><span>USD/ha venta</span><strong>{fmt(roi.usd_ha_venta)}</strong></div>}
                {roi.gap_vs_mercado!=null&&<div className="roi-card roi-card-destacado roi-card-azul"><span>GAP vs mercado</span><strong className={roi.gap_vs_mercado>=0?'verde':'rojo'}>{roi.gap_vs_mercado>=0?'+':''}{fmt(roi.gap_vs_mercado)}</strong><small className="nota">{roi.gap_porcentaje!=null?(roi.gap_porcentaje>=0?'+':'')+roi.gap_porcentaje+'%':''}</small></div>}
                {roi.roi_anual&&<div className="roi-card roi-card-destacado roi-card-azul"><span>ROI anual</span><strong className={roi.roi_anual>=0?'verde':'rojo'}>{fmtPct(roi.roi_anual)}</strong><small className="nota">en {roi.meses_operacion} meses</small></div>}
              </div>
            </div>
          )}

        </div>
      )}

      {datosGrafico.length>=2?(
        <div className="seccion">
          <h3>Evolución del valor</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={datosGrafico} margin={{top:10,right:10,left:10,bottom:10}}>
              <XAxis dataKey="fecha" tick={{fontSize:11,fill:'#848e9c'}}/>
              <YAxis tick={{fontSize:11,fill:'#848e9c'}} tickFormatter={v=>'$'+(v/1000).toFixed(0)+'k'}/>
              <Tooltip contentStyle={{background:'#1e2329',border:'1px solid #2b3139',borderRadius:'8px'}} formatter={v=>fmt(v)}/>
              <Legend/>
              <Line type="monotone" dataKey="valor" stroke="#0ecb81" strokeWidth={2} dot={{r:4}} name="Valor USD"/>
            </LineChart>
          </ResponsiveContainer>
          <h3 style={{marginTop:'28px'}}>Evolución del ROI</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={datosGrafico} margin={{top:10,right:10,left:10,bottom:10}}>
              <XAxis dataKey="fecha" tick={{fontSize:11,fill:'#848e9c'}}/>
              <YAxis tick={{fontSize:11,fill:'#848e9c'}} tickFormatter={v=>v+'%'}/>
              <Tooltip contentStyle={{background:'#1e2329',border:'1px solid #2b3139',borderRadius:'8px'}} formatter={v=>fmtPct(v)}/>
              <Legend/>
              <Line type="monotone" dataKey="roi" stroke="#f0b90b" strokeWidth={2} dot={{r:4}} name="ROI %"/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      ):(
        <div className="aviso">Agregá al menos 2 valuaciones para ver los gráficos.</div>
      )}

      {movCompra.length>0&&(
        <div className="seccion">
          <h3>Financiación de compra</h3>
          <SeccionFinanciacion operacion="compra" movimientos={movCompra}
            onAgregar={async d=>{await axios.post(`${API}/movimientos`,{...d,propiedad_id:prop.id},{headers:authHeaders()});cargarDatos()}}
            onConfirmar={confirmarMov} onEliminar={eliminarMov}
            precioBase={prop.precio_compra} fechaBase={prop.fecha_compra} tasaInicial={TASA_DEFAULT}/>
        </div>
      )}
      {movVenta.length>0&&(
        <div className="seccion">
          <h3>Financiación de venta</h3>
          <SeccionFinanciacion operacion="venta" movimientos={movVenta}
            onAgregar={async d=>{await axios.post(`${API}/movimientos`,{...d,propiedad_id:prop.id},{headers:authHeaders()});cargarDatos()}}
            onConfirmar={confirmarMov} onEliminar={eliminarMov}
            precioBase={prop.precio_venta} fechaBase={prop.fecha_venta} tasaInicial={TASA_DEFAULT}/>
        </div>
      )}

      <div className="seccion">
        <h3>Valuaciones <small className="nota">· de más antigua a más nueva</small></h3>
        {valuaciones.length===0&&<p className="vacio-small">Sin valuaciones cargadas.</p>}
        {valuaciones.map(v=>(
          <div key={v.id} className="item">
            <span>{fmtFecha(v.fecha)}</span><span>{fmt(v.valor_usd)}</span>
            <span className="fuente">{v.fuente}</span>
            <button className="danger small" onClick={()=>eliminarValuacion(v.id)}>✕</button>
          </div>
        ))}
        <div className="mini-form">
          <div className="mini-form-group"><label>Fecha</label><input type="date" value={nuevaVal.fecha} onChange={e=>setNuevaVal({...nuevaVal,fecha:e.target.value})}/></div>
          <div className="mini-form-group"><label>Valor USD</label><input type="number" placeholder="Ej: 75000" value={nuevaVal.valor_usd} onChange={e=>setNuevaVal({...nuevaVal,valor_usd:e.target.value})}/></div>
          <button onClick={agregarValuacion}>Agregar</button>
        </div>
      </div>

      <div className="seccion">
        <h3>Alquileres <small className="nota">· de más antiguo a más nuevo</small></h3>
        {alquileres.length===0&&<p className="vacio-small">Sin alquileres cargados.</p>}
        {alquileres.map(a=>(
          <div key={a.id} className="item">
            <span>{fmtFecha(a.fecha_desde)}</span><span>{fmt(a.monto_usd)}</span>
            <span>{a.inquilino||'—'}</span>
            <button className="danger small" onClick={()=>eliminarAlquiler(a.id)}>✕</button>
          </div>
        ))}
        <div className="mini-form">
          <div className="mini-form-group"><label>Desde</label><input type="date" value={nuevoAlq.fecha_desde} onChange={e=>setNuevoAlq({...nuevoAlq,fecha_desde:e.target.value})}/></div>
          <div className="mini-form-group"><label>Hasta</label><input type="date" value={nuevoAlq.fecha_hasta} onChange={e=>setNuevoAlq({...nuevoAlq,fecha_hasta:e.target.value})}/></div>
          <div className="mini-form-group"><label>Monto USD</label><input type="number" placeholder="Ej: 500" value={nuevoAlq.monto_usd} onChange={e=>setNuevoAlq({...nuevoAlq,monto_usd:e.target.value})}/></div>
          <div className="mini-form-group"><label>Inquilino</label><input placeholder="Nombre" value={nuevoAlq.inquilino} onChange={e=>setNuevoAlq({...nuevoAlq,inquilino:e.target.value})}/></div>
          <button onClick={agregarAlquiler}>Agregar</button>
        </div>
      </div>
    </div>
  )
}
function Configuracion({ config, onGuardar, onCancelar }) {
  const [form, setForm] = useState({
    nombre_empresa: config.nombre_empresa||'',
    logo_url: config.logo_url||'',
    color_primario: config.color_primario||'#f0b90b',
    color_secundario: config.color_secundario||'#0ecb81',
  })

  function cambiar(k,v) { setForm(f=>({...f,[k]:v})) }

  return (
    <div className="formulario">
      <h2>⚙️ Configuración de marca</h2>
      <div className="form-section">
        <div className="form-section-title">Identidad</div>
        <label>Nombre de la empresa</label>
        <input placeholder="Ej: O'Keefe Inmobiliaria" value={form.nombre_empresa} onChange={e=>cambiar('nombre_empresa',e.target.value)} />
        <label>Logo de la empresa</label>
        <input
          type="file"
          accept="image/*"
          onChange={e=>{
            const file = e.target.files[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = ev => cambiar('logo_url', ev.target.result)
            reader.readAsDataURL(file)
          }}
          style={{marginBottom:'14px'}}
        />
        {form.logo_url && (
          <div style={{padding:'12px',background:'#0b0e11',borderRadius:'8px',marginBottom:'14px',textAlign:'center',border:'1px solid #2b3139'}}>
            <img src={form.logo_url} alt="Preview" style={{maxHeight:'60px',maxWidth:'200px',objectFit:'contain'}} />
            <div style={{marginTop:'8px'}}>
              <button className="danger small" onClick={()=>cambiar('logo_url','')}>✕ Quitar logo</button>
            </div>
          </div>
        )}
      </div>
      <div className="form-section">
        <div className="form-section-title">Colores institucionales</div>
        <div className="form-row-2">
          <div>
            <label>Color primario</label>
            <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:'14px'}}>
              <input type="color" value={form.color_primario} onChange={e=>cambiar('color_primario',e.target.value)} style={{width:'48px',height:'36px',padding:'2px',cursor:'pointer'}} />
              <input value={form.color_primario} onChange={e=>cambiar('color_primario',e.target.value)} style={{flex:1}} />
            </div>
          </div>
          <div>
            <label>Color secundario</label>
            <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:'14px'}}>
              <input type="color" value={form.color_secundario} onChange={e=>cambiar('color_secundario',e.target.value)} style={{width:'48px',height:'36px',padding:'2px',cursor:'pointer'}} />
              <input value={form.color_secundario} onChange={e=>cambiar('color_secundario',e.target.value)} style={{flex:1}} />
            </div>
          </div>
        </div>
        <div style={{background:'#1e2329',borderRadius:'8px',padding:'14px',border:'1px solid #2b3139',marginBottom:'14px'}}>
          <div style={{color:form.color_primario,fontWeight:600,fontSize:'16px',marginBottom:'8px'}}>{form.nombre_empresa||'PropTrack'}</div>
          <button style={{background:form.color_primario,color:'#0b0e11',border:'none',padding:'8px 16px',borderRadius:'6px',fontWeight:600,marginRight:'8px'}}>Botón primario</button>
          <button style={{background:form.color_secundario+'22',color:form.color_secundario,border:`1px solid ${form.color_secundario}44`,padding:'8px 16px',borderRadius:'6px',fontWeight:600}}>Botón secundario</button>
        </div>
      </div>
      <div className="botones">
        <button className="btn-primary" onClick={()=>onGuardar(form)}>Guardar configuración</button>
        <button className="danger" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  )
}
function App() {
  const [usuario,setUsuario] = useState(null)
  const [propiedades,setPropiedades] = useState([])
  const [vista,setVista] = useState('inicio')
  const [propSeleccionada,setPropSeleccionada] = useState(null)
  const [editando,setEditando] = useState(null)
  const [vendiendo,setVendiendo] = useState(null)
  const [alquilando,setAlquilando] = useState(null)
  const [config, setConfig] = useState(()=>{
    try { return JSON.parse(localStorage.getItem('proptrack_config')||'{}') } catch { return {} }
  })

  function aplicarConfig(cfg) {
    const root = document.documentElement
    if (cfg.color_primario) root.style.setProperty('--color-primario', cfg.color_primario)
    if (cfg.color_secundario) root.style.setProperty('--color-secundario', cfg.color_secundario)
  }

  function guardarConfig(nuevaConfig) {
    localStorage.setItem('proptrack_config', JSON.stringify(nuevaConfig))
    setConfig(nuevaConfig)
    aplicarConfig(nuevaConfig)
    setVista('inicio')
  }

  useEffect(()=>{
    const token=getToken()
    if(token){
      axios.get(`${API}/auth/me`,{headers:authHeaders()})
        .then(r=>{setUsuario(r.data);cargarPropiedades()})
        .catch(()=>removeToken())
    }
  },[])
  useEffect(()=>{ aplicarConfig(config) },[])

  async function cargarPropiedades(){
    const res=await axios.get(`${API}/propiedades`,{headers:authHeaders()})
    setPropiedades(res.data)
  }

  function handleLogin(u){setUsuario(u);cargarPropiedades()}
  function logout(){removeToken();setUsuario(null);setPropiedades([]);setVista('inicio')}

  async function agregarPropiedad(datos, movs) {
    const res = await axios.post(`${API}/propiedades`, datos, {headers:authHeaders()})
    const propId = res.data.id
    if (movs && movs.length > 0) {
      for (const m of movs) {
        if (typeof m.id !== 'number' || m.id > 1000000000) {
          await axios.post(`${API}/movimientos`, {...m, propiedad_id: propId}, {headers:authHeaders()})
        }
      }
    }
    cargarPropiedades(); setVista('inicio')
  }

  async function actualizarPropiedad(id,datos,movs){
    const res = await axios.put(`${API}/propiedades/${id}`,datos,{headers:authHeaders()})
    console.log('respuesta partido:', res.data.partido, res.data.provincia)
    cargarPropiedades();setVista('inicio')
  }
  async function eliminarPropiedad(id){
    if(confirm('¿Eliminar esta propiedad?')){
      await axios.delete(`${API}/propiedades/${id}`,{headers:authHeaders()})
      cargarPropiedades()
    }
  }
  async function registrarVenta(datos){
    await axios.put(`${API}/propiedades/${datos.id}`,datos,{headers:authHeaders()})
    cargarPropiedades();setVista('inicio')
  }

  if(!usuario) return <AuthScreen onLogin={handleLogin}/>

  return (
    <div className="app">
      <header>
        <h1 onClick={()=>setVista('inicio')} style={{cursor:'pointer'}}>
          {config.logo_url
            ? <img src={config.logo_url} alt="Logo" style={{height:'32px',objectFit:'contain'}} />
            : <span style={{color: config.color_primario||'#f0b90b'}}>🏠 {config.nombre_empresa||'PropTrack'}</span>
          }
        </h1>
        <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
          <span style={{fontSize:'13px',color:'#848e9c'}}>Hola, {usuario.nombre}</span>
          <button onClick={()=>setVista('nueva')}>+ Nueva propiedad</button>
          <button onClick={()=>setVista('config')} style={{background:'transparent',color:'#848e9c',border:'1px solid #2b3139'}}>⚙️</button>
          <button onClick={logout} style={{background:'transparent',color:'#848e9c',border:'1px solid #2b3139'}}>Salir</button>
        </div>
      </header>
      {vista==='inicio'&&<Inicio propiedades={propiedades}
        onVer={p=>{setPropSeleccionada(p);setVista('detalle')}}
        onEditar={p=>{setEditando(p);setVista('editar')}}
        onEliminar={eliminarPropiedad}
        onVender={p=>{setVendiendo(p);setVista('venta')}}
        onAlquilar={p=>{setAlquilando(p);setVista('alquiler')}}
      />}
      {vista==='nueva'&&<FormPropiedad onGuardar={agregarPropiedad} onCancelar={()=>setVista('inicio')}/>}
      {vista==='editar'&&editando&&<FormPropiedad inicial={editando} onGuardar={(d,movs)=>actualizarPropiedad(editando.id,d,movs)} onCancelar={()=>setVista('inicio')}/>}
      {vista==='venta'&&vendiendo&&<FormVenta prop={vendiendo} onGuardar={registrarVenta} onCancelar={()=>setVista('inicio')}/>}
      {vista==='alquiler'&&alquilando&&<FormAlquiler prop={alquilando} onCancelar={()=>setVista('inicio')}/>}
      {vista==='config'&&<Configuracion config={config} onGuardar={guardarConfig} onCancelar={()=>setVista('inicio')}/>}
      {vista==='detalle'&&propSeleccionada&&<Detalle prop={propSeleccionada}
        onVolver={()=>setVista('inicio')}
        onEditar={()=>{setEditando(propSeleccionada);setVista('editar')}}
        onVender={p=>{setVendiendo(p);setVista('venta')}}
        onAlquilar={p=>{setAlquilando(p);setVista('alquiler')}}
      />}
    </div>
  )
}

export default App