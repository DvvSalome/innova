-- Rotating background photos for the home hero (index.html), managed from
-- the "Sliders del hero" view in the panel.

create table public.hero_sliders (
  id uuid primary key default gen_random_uuid(),
  imagen_url text not null,
  alt_text text,
  orden int not null default 0,
  activo boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index hero_sliders_orden_idx on public.hero_sliders (orden);

create trigger hero_sliders_set_updated_at
  before update on public.hero_sliders
  for each row execute function public.set_updated_at();

alter table public.hero_sliders enable row level security;

create policy "Anyone can view active sliders"
  on public.hero_sliders for select
  using (activo);

create policy "Admins can view all sliders"
  on public.hero_sliders for select
  using (public.is_admin());

create policy "Admins can insert sliders"
  on public.hero_sliders for insert
  with check (public.is_admin());

create policy "Admins can update sliders"
  on public.hero_sliders for update
  using (public.is_admin());

create policy "Admins can delete sliders"
  on public.hero_sliders for delete
  using (public.is_admin());
