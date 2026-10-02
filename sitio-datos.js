/* Contenido público que se edita desde el panel (admin.html).
   Lee de Supabase con la clave pública y reemplaza el contenido estático de la página
   solo si la respuesta es válida: si la base no responde, se queda lo que ya está en el HTML.
   - .hero-bg                → hero_sliders (fotos rotativas del inicio)
   - #gallery[data-momentos] → momentos publicados (inicio y comunidad)
   - #tlWrap[data-etapas]    → etapas_convocatoria (cronograma de la convocatoria)
   - [data-resultados]       → resultados_programa (cifras en «Nosotros») */
(function () {
  'use strict';
  var cfg = window.INNOVA_SUPABASE;
  if (!cfg || !cfg.url || !cfg.anonKey || !window.fetch) return;

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var verPrueba = /[?&]prueba=1(&|$)/.test(location.search);

  function q(path) {
    return fetch(cfg.url + '/rest/v1/' + path, {
      headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey }
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function httpsUrl(u) {
    try { var x = new URL(String(u || '').trim()); return x.protocol === 'https:' ? x.href : null; } catch (e) { return null; }
  }
  function esPrueba(t) { return /^\s*\[PRUEBA\]/i.test(t || ''); }
  function fechaCorta(iso) {
    try {
      var p = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Bogota' }).formatToParts(new Date(iso));
      var get = function (t) { var x = p.filter(function (y) { return y.type === t; })[0]; return x ? x.value : ''; };
      return get('day') + ' ' + get('month').replace('.', '').replace(/^sept$/, 'sep') + ' ' + get('year');
    } catch (e) { return ''; }
  }
  function numero(v) { return Number(v).toLocaleString('es-CO'); }

  /* ---------- Sliders del hero ---------- */
  var heroBg = document.querySelector('.hero-bg');
  if (heroBg) {
    q('hero_sliders?select=imagen_url,alt_text&activo=eq.true&order=orden.asc,created_at.asc')
      .then(function (rows) {
        var list = rows.map(function (r) { return { src: httpsUrl(r.imagen_url), alt: r.alt_text || '' }; })
          .filter(function (r) { return r.src; });
        if (!list.length) return;
        // Se cambia solo cuando la primera foto ya cargó, para no dejar el hero en blanco.
        var first = new Image();
        first.onload = function () { pintarHero(list); };
        first.src = list[0].src;
      })
      .catch(function () {});
  }
  function pintarHero(list) {
    var n = list.length, porFoto = 6;
    heroBg.innerHTML = list.map(function (s, i) {
      return '<img src="' + esc(s.src) + '" alt="' + esc(i === 0 ? (s.alt || 'Emprendedores de Innova Social') : s.alt) + '"' + (i ? ' decoding="async"' : '') + '>';
    }).join('');
    var imgs = heroBg.querySelectorAll('img');
    if (n === 1 || reduce) {
      // El CSS ya deja visible solo la primera en movimiento reducido.
      if (n === 1) { imgs[0].style.animation = 'none'; imgs[0].style.opacity = '1'; }
      return;
    }
    var vis = 100 / n, f = Math.min(4, vis / 5);
    var r = function (x) { return x.toFixed(2) + '%'; };
    var st = document.createElement('style');
    st.textContent = '@keyframes heroFadeDb{0%{opacity:0}' + r(f) + '{opacity:1}' + r(vis) + '{opacity:1}' + r(vis + f) + '{opacity:0}100%{opacity:0}}';
    document.head.appendChild(st);
    for (var i = 0; i < imgs.length; i++) {
      imgs[i].style.animation = 'heroFadeDb ' + (n * porFoto) + 's infinite';
      imgs[i].style.animationDelay = (i * porFoto) + 's';
    }
  }

  /* ---------- Momentos (galería) ---------- */
  var gallery = document.querySelector('#gallery[data-momentos]');
  if (gallery) {
    var max = parseInt(gallery.getAttribute('data-momentos'), 10) || 12;
    q('momentos?select=*&estado=eq.publicado&order=fecha_publicacion.desc&limit=' + (max + 5))
      .then(function (rows) {
        rows = rows.filter(function (m) { return verPrueba || !esPrueba(m.titulo); }).slice(0, max);
        if (!rows.length) return;
        // Las fotos que ya vienen en la página se reutilizan si la entrada sigue con su imagen original.
        var locales = {};
        gallery.querySelectorAll('a.gcard').forEach(function (a) {
          var m = (a.getAttribute('href') || '').match(/slug=([^&#]+)/), img = a.querySelector('img');
          if (m && img) locales[decodeURIComponent(m[1])] = img.getAttribute('src');
        });
        gallery.innerHTML = rows.map(function (m, i) {
          var url = httpsUrl(m.imagen_destacada_url), local = locales[m.slug];
          var src = local && (!url || /apischool\.innovasocial\.co/.test(url)) ? local : url;
          return '<a class="gcard" href="momento.html?slug=' + encodeURIComponent(m.slug) + '">'
            + (src ? '<img src="' + esc(src) + '" alt="' + esc(m.imagen_alt || '') + '" loading="' + (i < 3 ? 'eager' : 'lazy') + '"' + (local && src !== local ? ' data-local="' + esc(m.slug) + '"' : '') + '>' : '<div class="gcard-ph"></div>')
            + '<div class="fade"></div><div class="txt">'
            + '<span class="tag' + (i === 0 ? ' hot' : '') + '">Momentos</span>'
            + '<h3>' + esc(m.titulo) + '</h3>'
            + (m.resumen_tarjeta ? '<p>' + esc(m.resumen_tarjeta) + '</p>' : '')
            + '<div class="meta"><span>' + esc(m.autor || 'Innova Social') + '</span><span>' + esc(fechaCorta(m.fecha_publicacion)) + '</span></div>'
            + '</div></a>';
        }).join('');
        gallery.querySelectorAll('img[data-local]').forEach(function (img) {
          img.addEventListener('error', function () { img.src = locales[img.getAttribute('data-local')]; }, { once: true });
        });
        gallery.scrollLeft = 0;
        gallery.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('resize'));
      })
      .catch(function () {});
  }

  /* ---------- Etapas de la convocatoria ---------- */
  var ICONOS = {
    lanzamiento: '<path d="M4 14l3-1 4 4-1 3-6-6z"/><path d="M7 13c2-6 7-9 13-9 0 6-3 11-9 13"/><circle cx="14.5" cy="9.5" r="1.6"/>',
    preseleccion: '<path d="M9 5h9M9 12h9M9 19h9"/><path d="M4 5l1 1 2-2M4 12l1 1 2-2M4 19l1 1 2-2"/>',
    bootcamp: '<path d="M3 9l9-4 9 4-9 4-9-4z"/><path d="M7 11v5c0 1 2 3 5 3s5-2 5-3v-5"/>',
    pitch: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
    ceremonia: '<path d="M8 4h8v5a4 4 0 01-8 0V4z"/><path d="M8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4M12 13v4M8 20h8"/>',
    incubacion: '<path d="M12 21v-9"/><path d="M12 12c0-4 3-7 8-7 0 5-3 7-8 7z"/><path d="M12 15c0-3-2-5-7-5 0 4 3 5 7 5z"/>'
  };
  var ORDEN_ICONO = ['lanzamiento', 'preseleccion', 'bootcamp', 'pitch', 'ceremonia', 'incubacion'];
  function icono(k) {
    var p = ICONOS[k] || ICONOS.lanzamiento;
    return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }

  var tlWrap = document.querySelector('#tlWrap[data-etapas]');
  if (tlWrap) {
    q('etapas_convocatoria?select=*&order=orden.asc,created_at.asc')
      .then(function (rows) {
        rows = rows.filter(function (e) { return e.nombre && (verPrueba || !esPrueba(e.nombre)); });
        if (!rows.length) return;
        var tl = tlWrap.querySelector('.tl');
        var yaVisible = !!tl.querySelector('.tl-step.in');
        tl.style.setProperty('--n', rows.length);
        tl.innerHTML = rows.map(function (e, i) {
          var k = ICONOS[e.icono] ? e.icono : ORDEN_ICONO[Math.min(i, ORDEN_ICONO.length - 1)];
          return '<div class="tl-step' + (i === rows.length - 1 ? ' last' : '') + (yaVisible ? ' in' : '') + '">'
            + '<div class="tl-dot ic">' + icono(k) + '</div>'
            + '<div class="tl-num">Etapa ' + String(i + 1).padStart(2, '0') + '</div>'
            + '<h4>' + esc(e.nombre) + '</h4><p>' + esc(String(e.fechas_texto || '').replace(/\s+/g, ' ').trim()) + '</p>'
            + (e.descripcion ? '<p class="tl-desc">' + esc(e.descripcion) + '</p>' : '')
            + '</div>';
        }).join('');
      })
      .catch(function () {});
  }

  /* ---------- Resultados del programa ---------- */
  var resBox = document.querySelector('[data-resultados]');
  if (resBox) {
    q('resultados_programa?select=grupo,etiqueta,valor,orden&order=grupo.asc,orden.asc')
      .then(function (rows) {
        ['actual', 'historico'].forEach(function (g) {
          var cont = resBox.querySelector('[data-grupo="' + g + '"]');
          if (!cont) return;
          var items = rows.filter(function (r) { return r.grupo === g && Number(r.valor) > 0; });
          var bloque = cont.closest('.res-grupo') || cont;
          if (!items.length) { bloque.hidden = true; return; }
          cont.innerHTML = items.map(function (r) {
            return '<div class="res-item"><b>' + esc(numero(r.valor)) + '</b><span>' + esc(r.etiqueta) + '</span></div>';
          }).join('');
          bloque.hidden = false;
        });
      })
      .catch(function () {});
  }
})();
