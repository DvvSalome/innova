-- Tipo de documento de identidad en postulaciones.
-- El número sigue en la columna cedula (número del documento elegido).

alter table public.postulaciones
  add column if not exists tipo_documento text
    check (tipo_documento is null or tipo_documento in ('CC', 'CE', 'PA', 'PPT', 'otro'));

comment on column public.postulaciones.tipo_documento is 'Tipo de documento de identidad (mayores de edad): CC, CE, PA, PPT u otro';
comment on column public.postulaciones.cedula is 'Número del documento de identidad (cédula, pasaporte, etc.)';
