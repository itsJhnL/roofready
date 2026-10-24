-- RoofReady prototype schema
-- Run in the Supabase SQL editor, or with `supabase db push`.

create extension if not exists pgcrypto;

-- One uploaded measurement report
create table if not exists reports (
  id              uuid primary key default gen_random_uuid(),
  file_name       text not null,
  storage_path    text not null,
  provider        text not null,                 -- gaf_quickmeasure | roofscope | unknown
  provider_label  text not null,
  address         text,
  report_date     date,
  page_methods    text[] not null default '{}',  -- per page: text | ocr
  status          text not null default 'needs_review'
                  check (status in ('needs_review', 'approved')),
  pitch_breakdown jsonb not null default '[]',
  planes          jsonb not null default '[]',
  waste_table     jsonb not null default '[]',
  raw_extraction  jsonb not null,                -- full extractor response, kept for audit
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One row per normalized measurement field. extracted_value never changes; value is the reviewed value.
create table if not exists measurements (
  id               uuid primary key default gen_random_uuid(),
  report_id        uuid not null references reports(id) on delete cascade,
  key              text not null,
  label            text not null,
  unit             text not null,
  extracted_value  numeric,
  value            numeric,
  confidence       text not null check (confidence in ('high', 'medium', 'low', 'derived', 'missing')),
  method           text not null,                -- text | ocr | derived | none
  source_page      int,
  source_text      text,
  is_corrected     boolean generated always as (value is distinct from extracted_value) stored,
  updated_at       timestamptz not null default now(),
  unique (report_id, key)
);

-- Audit trail of every manual correction
create table if not exists measurement_corrections (
  id              uuid primary key default gen_random_uuid(),
  measurement_id  uuid not null references measurements(id) on delete cascade,
  report_id       uuid not null references reports(id) on delete cascade,
  key             text not null,
  old_value       numeric,
  new_value       numeric,
  note            text,
  created_at      timestamptz not null default now()
);

-- Flags raised by the extractor (OCR, cross-checks) and by validation at approval time
create table if not exists report_flags (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references reports(id) on delete cascade,
  source      text not null check (source in ('extractor', 'validation')),
  code        text not null,
  severity    text not null check (severity in ('info', 'warning', 'error')),
  field       text,
  message     text not null,
  created_at  timestamptz not null default now()
);

-- Configurable calculation settings (waste, coverage per unit, rules). Editable on the Settings page.
create table if not exists material_settings (
  key          text primary key,
  value        numeric not null,
  unit         text not null,
  label        text not null,
  description  text not null,
  sort_order   int not null default 0,
  updated_at   timestamptz not null default now()
);

-- Each calculation run is stored as an immutable snapshot of inputs, settings and results.
create table if not exists material_calculations (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid not null references reports(id) on delete cascade,
  engine_version  text not null,
  inputs          jsonb not null,
  settings        jsonb not null,
  results         jsonb not null,
  warnings        jsonb not null default '[]',
  created_at      timestamptz not null default now()
);

create index if not exists measurements_report_idx on measurements(report_id);
create index if not exists flags_report_idx on report_flags(report_id);
create index if not exists calcs_report_idx on material_calculations(report_id, created_at desc);

-- Default settings: common industry values, all editable.
insert into material_settings (key, value, unit, label, description, sort_order) values
  ('default_waste_pct',        10,   '%',        'Default waste',                 'Used when the report has no suggested waste, or when "Use provider waste" is off.', 10),
  ('use_provider_waste',       1,    '0/1',      'Use provider suggested waste',  '1 = use the waste % suggested in the report when available. 0 = always use the default.', 20),
  ('shingle_bundles_per_sq',   3,    'bundles',  'Shingle bundles per square',    'Bundles needed to cover 100 sf (3 for most architectural shingles).', 30),
  ('starter_lf_per_bundle',    120,  'lf',       'Starter LF per bundle',         'Linear feet covered by one bundle of starter strip.', 40),
  ('ridge_cap_lf_per_bundle',  25,   'lf',       'Ridge cap LF per bundle',       'Linear feet covered by one bundle of hip & ridge cap.', 50),
  ('iwb_sqft_per_roll',        200,  'sf',       'Ice & water sf per roll',       'Square feet per roll of ice & water barrier (2-square roll).', 60),
  ('iwb_roll_width_ft',        3,    'ft',       'Ice & water roll width',        'Used to convert a reported linear-feet leak barrier value to square feet.', 70),
  ('iwb_eave_width_ft',        6,    'ft',       'Ice & water width at eaves',    'Fallback formula only: coverage width up from the eave (2 courses of 3 ft).', 80),
  ('iwb_valley_width_ft',      3,    'ft',       'Ice & water width in valleys',  'Fallback formula only: coverage width centered on each valley.', 90),
  ('low_slope_threshold',      4,    'in/12',    'Low-slope threshold',           'Pitches below this are treated as low slope.', 100),
  ('low_slope_full_iwb',       1,    '0/1',      'Full ice & water on low slope', '1 = add the full low-slope area to the ice & water quantity.', 110),
  ('underlayment_sqft_per_roll', 1000, 'sf',     'Underlayment sf per roll',      'Square feet per roll of synthetic underlayment (10 squares).', 120),
  ('underlayment_waste_pct',   10,   '%',        'Underlayment waste',            'Overlap and waste added to underlayment.', 130),
  ('drip_edge_piece_ft',       10,   'ft',       'Drip edge piece length',        'Length of one drip edge piece.', 140),
  ('drip_edge_waste_pct',      10,   '%',        'Drip edge waste',               'Overlap and waste added to drip edge.', 150)
on conflict (key) do nothing;

-- Storage bucket for the uploaded PDFs (private)
insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

-- The prototype has no user login: the Next.js server uses the service role key
-- and the browser never talks to Supabase directly. RLS is enabled with no policies
-- so the anon key cannot read or write anything.
alter table reports enable row level security;
alter table measurements enable row level security;
alter table measurement_corrections enable row level security;
alter table report_flags enable row level security;
alter table material_settings enable row level security;
alter table material_calculations enable row level security;
