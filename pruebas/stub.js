// Cliente falso de Supabase: responde desde fixtures.json, que salió de un
// Postgres real con RLS aplicada rol por rol. El panel no sabe la diferencia.
(function(){
  const rol = new URLSearchParams(location.search).get('rol') || 'admin';
  const V = window.__FIXTURES[rol];
  if (!V) throw new Error('rol desconocido: ' + rol);
  const perfil = V.perfil;
  const clone = (x) => JSON.parse(JSON.stringify(x));

  const ALIAS = { profiles: () => [perfil], ranking_postulaciones: () => V.ranking };
  function tabla(nombre){
    let filas = clone((ALIAS[nombre] ? ALIAS[nombre]() : V[nombre]) || []);
    const api = {
      select(){ return api; },
      eq(col,val){ filas = filas.filter(r => String(r[col]) === String(val)); return api; },
      neq(col,val){ filas = filas.filter(r => String(r[col]) !== String(val)); return api; },
      in(col,vals){ filas = filas.filter(r => vals.includes(r[col])); return api; },
      order(col,o){ const d = o && o.ascending === false ? -1 : 1;
        filas.sort((a,b)=> (a[col]>b[col]?1:a[col]<b[col]?-1:0)*d); return api; },
      limit(n){ filas = filas.slice(0,n); return api; },
      maybeSingle(){ return Promise.resolve({ data: filas[0] || null, error: null }); },
      single(){ return Promise.resolve({ data: filas[0] || null, error: filas.length?null:{message:'0 filas'} }); },
      insert(){ return api; }, update(){ return api; }, upsert(){ return api; }, delete(){ return api; },
      then(res, rej){ return Promise.resolve({ data: filas, error: null }).then(res, rej); },
    };
    return api;
  }
  window.INNOVA_SUPABASE = { url:'http://local.test', anonKey:'stub' };
  window.supabase = { createClient(){ return {
    from: tabla,
    rpc: () => Promise.resolve({ data: null, error: { message:'rpc no disponible en el banco de pruebas' } }),
    auth: {
      getSession: () => Promise.resolve({ data:{ session:{ user:{ id:perfil.id, email:perfil.email } } }, error:null }),
      getUser:    () => Promise.resolve({ data:{ user:{ id:perfil.id, email:perfil.email } }, error:null }),
      onAuthStateChange: () => ({ data:{ subscription:{ unsubscribe(){} } } }),
      signInWithPassword: () => Promise.resolve({ data:{}, error:null }),
      signOut: () => Promise.resolve({ error:null }),
    },
    storage: { from: () => ({
      createSignedUrl: (p) => Promise.resolve({ data:{ signedUrl:'#'+p }, error:null }),
      upload: () => Promise.resolve({ data:{}, error:null }),
      getPublicUrl: (p) => ({ data:{ publicUrl:'#'+p } }),
    })},
    functions: { invoke: () => Promise.resolve({ data:null, error:{ message:'correos no disponible en el banco de pruebas' } }) },
  }; } };
})();
