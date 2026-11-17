// Prueba del archivo supabase/APLICAR-EN-SQL-EDITOR.sql antes de pegarlo en producción.
// Parte de una base «como producción» (todas las migraciones menos las dos nuevas), ejecuta el
// archivo dos veces y comprueba: índice de cédula única, enlace de fotos, subida de adjuntos
// soporte_ventas_1 a 4 y que, con cédulas repetidas previas, el archivo se detiene sin dejar nada.
// Correr: cd pruebas && node migraciones.js
import { readFileSync } from 'node:fs';
import { as, asCommit, build } from './db.js';
import { ANON, seed } from './personas.js';
const res=[]; const t=(n,c,d='')=>res.push([c?'OK   ':'FALLA',n,d]);
const SQL=readFileSync(new URL('../supabase/APLICAR-EN-SQL-EDITOR.sql', import.meta.url), 'utf8');

// A) Base «como producción»: todas las migraciones MENOS las dos nuevas, y luego el archivo del editor.
const { db } = await build({ hasta: '20261109999999' });
await seed(db);
const cols0=(await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name='postulaciones' and column_name='fotos_enlace'`)).rows.length;
const idx0=(await db.query(`select 1 from pg_indexes where indexname='postulaciones_cedula_unica'`)).rows.length;
t('antes: sin columna fotos_enlace ni índice de cédula', cols0===0 && idx0===0);
const ins=(ced,mail,extra='')=>`insert into public.postulaciones (nombre_completo,correo,whatsapp,cedula,municipio,domicilio,nombre_emprendimiento,redes) values ('X','${mail}','+573000000000','${ced}','Barranquilla','Barranquilla','X SAS','[]'::jsonb)`;
await asCommit(db,ANON,ins('111','a@example.com')); await asCommit(db,ANON,ins('222','b@example.com'));

let r=null; try { r=await db.exec(SQL); t('el archivo se ejecuta completo sobre la base existente', true);} catch(e){ t('el archivo se ejecuta completo sobre la base existente', false, e.message); }
const comp=(Array.isArray(r)?r:[]).map(x=>x.rows||[]).filter(x=>x.length&&x[0].comprobacion!==undefined)[0]||[]; t('la comprobación final devuelve 5 filas, todas ok', comp.length===5 && comp.every(x=>x.ok===true), JSON.stringify(comp.map(x=>x.comprobacion+'='+x.ok)));
try { await db.exec(SQL); t('se puede ejecutar una segunda vez sin error', true);} catch(e){ t('se puede ejecutar una segunda vez sin error', false, e.message); }
t('las 2 postulaciones existentes siguen intactas', (await db.query(`select count(*)::int n from public.postulaciones`)).rows[0].n===2);

// B) Efectos de la parte 1
t('cédula repetida (otro correo) se rechaza', !(await as(db,ANON,ins('111','otro@example.com'))).ok);
t('cédula repetida con espacios y mayúsculas se rechaza', !(await as(db,ANON,ins(' 111 ','otro2@example.com'))).ok);
t('cédula nueva pasa', (await as(db,ANON,ins('333','c@example.com'))).ok);

// C) Efectos de la parte 2: enlace de fotos
const conFotos=(v)=>`insert into public.postulaciones (nombre_completo,correo,whatsapp,cedula,municipio,domicilio,nombre_emprendimiento,redes,fotos_enlace) values ('X','f${Math.random()}@example.com','+573000000000','${Math.random()}','Barranquilla','Barranquilla','X','[]'::jsonb,${v})`;
t('fotos_enlace nulo pasa', (await as(db,ANON,conFotos('null'))).ok);
t('fotos_enlace https de Drive pasa', (await as(db,ANON,conFotos(`'https://drive.google.com/drive/folders/abc123?usp=sharing'`))).ok);
t('fotos_enlace «javascript:» se rechaza', !(await as(db,ANON,conFotos(`'javascript:alert(1)'`))).ok);
t('fotos_enlace con espacios se rechaza', !(await as(db,ANON,conFotos(`'https://x.com/a b'`))).ok);
t('fotos_enlace de más de 500 caracteres se rechaza', !(await as(db,ANON,conFotos(`'https://x.com/${'a'.repeat(600)}'`))).ok);
t('fotos_enlace sin protocolo se rechaza', !(await as(db,ANON,conFotos(`'drive.google.com/abc'`))).ok);

// D) Efectos de la parte 2: subida de adjuntos
const U='00000000-0000-4000-8000-0000000000';
const up=(n)=>as(db,ANON,`insert into storage.objects (bucket_id,name) values ('postulaciones','${U}11/${n}')`);
for (const n of ['cedula.pdf','rut.jpg','recibo_triple_a.png','soporte_ventas_1.pdf','soporte_ventas_2.jpeg','soporte_ventas_3.png','soporte_ventas_4.pdf']) t('subida permitida: '+n,(await up(n)).ok);
for (const n of ['soporte_ventas_5.pdf','soporte_ventas_0.pdf','soporte_ventas_.pdf','soporte_ventas_1.exe','soporte_ventas_1.html','soporte_ventas_12.pdf','Soporte_Ventas_1.pdf','otro.pdf','../soporte_ventas_1.pdf']) t('subida rechazada: '+n,!(await up(n)).ok);
t('otros buckets siguen cerrados para el anónimo', !(await as(db,ANON,`insert into storage.objects (bucket_id,name) values ('cursos','${U}11/soporte_ventas_1.pdf')`)).ok);
t('el anónimo sigue sin leer ni borrar adjuntos', (await as(db,ANON,`select 1 from storage.objects`)).rows.length===0 && ((await as(db,ANON,`delete from storage.objects returning 1`)).rows||[]).length===0);

// E) Duplicados previos: el archivo se detiene con mensaje y no cambia nada
const dup = (await build({ hasta: '20261109999999' })).db; await seed(dup);
await dup.exec(`insert into public.postulaciones (nombre_completo,correo,whatsapp,cedula,municipio,domicilio,nombre_emprendimiento,redes) values ('A','a1@example.com','+573000000000','777','B','B','A','[]'::jsonb),('B','b1@example.com','+573000000000',' 777 ','B','B','B','[]'::jsonb)`);
let msg=''; try { await dup.exec(SQL); } catch(e){ msg=e.message; await dup.exec('rollback'); }
t('con cédulas repetidas previas el archivo se detiene y nombra el documento', /mismo documento \(777\)/.test(msg), msg.slice(0,110));
t('…y no deja nada a medias (sin índice, sin columna)', (await dup.query(`select 1 from pg_indexes where indexname='postulaciones_cedula_unica'`)).rows.length===0 && (await dup.query(`select 1 from information_schema.columns where table_name='postulaciones' and column_name='fotos_enlace'`)).rows.length===0);

console.log(res.map(r=>r.join(' | ')).join('\n')); console.log('FALLAS:',res.filter(r=>r[0]==='FALLA').length,'de',res.length);
