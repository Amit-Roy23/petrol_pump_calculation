import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cloud, Database, Download, LogOut, RefreshCw, Fuel, Languages, Plus, RotateCcw, Sparkles, Trash2, Upload, Warehouse } from 'lucide-react';
import { RoundingMode } from '@petrolpump/shared';
import { useStore } from '../lib/store';
import { emptyData, sampleData } from '../lib/seed';
import type { AppData, FuelTone, Machine } from '../lib/types';
import { cn, downloadFile, todayISO, uid } from '../lib/util';
import { Card, Field, MoneyInput, SectionTitle, Segmented, toneClass } from '../components/ui';
import { SyncBadge } from '../components/Gate';

const TONES: FuelTone[] = ['petrol', 'diesel', 'premium', 'cng'];

export default function SettingsPage() {
  const { data, update, replace, t, toast, setDate, cloud, logout, syncNow } = useStore();
  const s = data.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const machineHasData = (m: Machine) => Object.values(data.days).some((d) => d.sheets[m.id]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{t('settingsTitle')}</h1>
        <p className="text-sm text-ink-2">{cloud.mode === 'cloud' ? t('cloudBody') : t('savedLocal')}</p>
      </div>

      {cloud.mode === 'cloud' && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-ok-soft text-ok">
              <Cloud className="h-5 w-5" />
            </span>
            <div>
              <div className="font-display font-bold">{t('cloudTitle')}</div>
              <SyncBadge />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={syncNow}>
              <RefreshCw className="h-4 w-4" /> {t('syncNow')}
            </button>
            <button className="btn-ghost" onClick={logout}>
              <LogOut className="h-4 w-4" /> {t('signOut')}
            </button>
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <SectionTitle icon={<Warehouse className="h-5 w-5 text-brand" />} title={t('stationName')} />
          <input className="input text-lg font-semibold" value={s.stationName} onChange={(e) => update((d) => void (d.settings.stationName = e.target.value))} />
        </Card>

        <Card className="space-y-4 p-4 sm:p-5">
          <SectionTitle icon={<Languages className="h-5 w-5 text-brand" />} title={`${t('language')} · ${t('theme')}`} />
          <div className="flex flex-wrap gap-3">
            <Segmented
              value={s.language}
              onChange={(v) => update((d) => void (d.settings.language = v))}
              options={[
                { value: 'en', label: 'English' },
                { value: 'bn', label: 'বাংলা' },
              ]}
            />
            <Segmented
              value={s.theme}
              onChange={(v) => update((d) => void (d.settings.theme = v))}
              options={[
                { value: 'system', label: t('system') },
                { value: 'light', label: t('light') },
                { value: 'dark', label: t('dark') },
              ]}
            />
          </div>
        </Card>
      </div>

      {/* Products */}
      <Card className="p-4 sm:p-5">
        <SectionTitle
          icon={<Fuel className="h-5 w-5 text-brand" />}
          title={t('products')}
          right={
            <button
              className="btn-ghost py-2"
              onClick={() =>
                update((d) =>
                  void d.settings.products.push({ id: uid(), name: 'New fuel', nameBn: '', tone: TONES[d.settings.products.length % TONES.length], ratePaise: 10000 })
                )
              }
            >
              <Plus className="h-4 w-4" /> {t('add')}
            </button>
          }
        />
        <div className="space-y-3">
          {s.products.map((p) => {
            const used = s.machines.some((m) => m.nozzles.some((n) => n.productId === p.id));
            return (
              <div key={p.id} className={cn('grid grid-cols-2 items-end gap-3 rounded-xl border-l-4 bg-sunk/60 p-3 sm:grid-cols-[1fr_1fr_auto_140px_auto]', toneClass[p.tone].bar)}>
                <Field label={t('productName')}>
                  <input className="input py-2" value={p.name} onChange={(e) => update((d) => void (d.settings.products.find((x) => x.id === p.id)!.name = e.target.value))} />
                </Field>
                <Field label={t('productNameBn')}>
                  <input className="input py-2" value={p.nameBn} onChange={(e) => update((d) => void (d.settings.products.find((x) => x.id === p.id)!.nameBn = e.target.value))} />
                </Field>
                <div>
                  <span className="label">Colour</span>
                  <div className="flex gap-1.5 py-2">
                    {TONES.map((tone) => (
                      <button
                        key={tone}
                        aria-label={tone}
                        onClick={() => update((d) => void (d.settings.products.find((x) => x.id === p.id)!.tone = tone))}
                        className={cn('h-7 w-7 rounded-full ring-offset-2 ring-offset-surface transition', toneClass[tone].dot, p.tone === tone && 'ring-2 ring-ink')}
                      />
                    ))}
                  </div>
                </div>
                <Field label={`${t('rate')} /L`}>
                  <MoneyInput value={p.ratePaise} onCommit={(v) => update((d) => void (d.settings.products.find((x) => x.id === p.id)!.ratePaise = v))} />
                </Field>
                <button
                  className="btn-quiet mb-0.5 justify-self-end hover:text-bad disabled:opacity-30"
                  disabled={used || s.products.length <= 1}
                  title={used ? 'In use by a nozzle' : t('delete')}
                  onClick={() => update((d) => void (d.settings.products = d.settings.products.filter((x) => x.id !== p.id)))}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Machines */}
      <Card className="p-4 sm:p-5">
        <SectionTitle
          title={t('machines')}
          right={
            <button
              className="btn-ghost py-2"
              onClick={() =>
                update((d) => {
                  const id = uid();
                  d.settings.machines.push({
                    id,
                    name: String(d.settings.machines.length + 1),
                    attendant: '',
                    active: true,
                    nozzles: [1, 2, 3, 4].map((i) => ({ id: `${id}-n${i}`, label: `N${i}`, productId: d.settings.products[i <= 2 ? 0 : Math.min(1, d.settings.products.length - 1)].id, initialReading: '' })),
                  });
                })
              }
            >
              <Plus className="h-4 w-4" /> {t('addMachine')}
            </button>
          }
        />
        <div className="grid gap-4 xl:grid-cols-2">
          {s.machines.map((m) => {
            const editM = (fn: (mm: Machine) => void) => update((d) => fn(d.settings.machines.find((x) => x.id === m.id)!));
            return (
              <div key={m.id} className={cn('rounded-2xl border border-line p-4', !m.active && 'opacity-60')}>
                <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
                  <Field label={t('machine')}>
                    <input className="input py-2 font-display text-lg font-bold" value={m.name} onChange={(e) => editM((mm) => (mm.name = e.target.value))} />
                  </Field>
                  <Field label={t('attendant')}>
                    <input className="input py-2" value={m.attendant} onChange={(e) => editM((mm) => (mm.attendant = e.target.value))} />
                  </Field>
                  <div className="flex items-center gap-1 pb-1">
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink-2">
                      <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={m.active} onChange={(e) => editM((mm) => (mm.active = e.target.checked))} />
                      {t('active')}
                    </label>
                    {!machineHasData(m) && (
                      <button className="btn-quiet px-2 hover:text-bad" aria-label={t('delete')} onClick={() => update((d) => void (d.settings.machines = d.settings.machines.filter((x) => x.id !== m.id)))}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="hidden grid-cols-[56px_1fr_1.3fr_32px] gap-2 text-[11px] sm:grid font-semibold uppercase tracking-wider text-ink-3">
                    <span>{t('nozzle')}</span>
                    <span>Fuel</span>
                    <span>{t('initialReading')}</span>
                    <span />
                  </div>
                  {m.nozzles.map((n) => (
                    <div key={n.id} className="grid grid-cols-[52px_1fr_32px] items-center gap-2 rounded-xl border border-line p-2 sm:grid-cols-[56px_1fr_1.3fr_32px] sm:border-0 sm:p-0">
                      <input className="input px-2 py-2 text-center font-bold" value={n.label} onChange={(e) => editM((mm) => (mm.nozzles.find((x) => x.id === n.id)!.label = e.target.value))} />
                      <select className="input py-2" value={n.productId} onChange={(e) => editM((mm) => (mm.nozzles.find((x) => x.id === n.id)!.productId = e.target.value))}>
                        {s.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <input
                        className="input num order-last col-span-3 py-2 sm:order-none sm:col-span-1"
                        inputMode="decimal"
                        placeholder={t('initialReading')}
                        value={n.initialReading}
                        onChange={(e) => editM((mm) => (mm.nozzles.find((x) => x.id === n.id)!.initialReading = e.target.value.replace(/[^\d.]/g, '')))}
                      />
                      <button
                        className="btn-quiet px-1.5 hover:text-bad disabled:opacity-30"
                        disabled={m.nozzles.length <= 1}
                        aria-label={t('delete')}
                        onClick={() => editM((mm) => (mm.nozzles = mm.nozzles.filter((x) => x.id !== n.id)))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    className="btn-quiet text-xs"
                    onClick={() => editM((mm) => mm.nozzles.push({ id: `${mm.id}-${uid()}`, label: `N${mm.nozzles.length + 1}`, productId: s.products[0].id, initialReading: '' }))}
                  >
                    <Plus className="h-3.5 w-3.5" /> {t('addNozzle')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Calculation rules */}
      <Card className="grid gap-5 p-4 sm:grid-cols-2 sm:p-5">
        <div>
          <span className="label">{t('rounding')}</span>
          <div className="space-y-2">
            {[
              [RoundingMode.TRUNCATE, t('truncate'), '121.77 × 100.45 = 12,231.79'],
              [RoundingMode.ROUND_HALF_UP, t('roundHalf'), '121.77 × 100.45 = 12,231.80'],
            ].map(([v, label, ex]) => (
              <label key={v} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-3', s.roundingMode === v ? 'border-brand bg-brand-soft/40' : 'border-line')}>
                <input type="radio" className="mt-1 accent-[rgb(var(--brand))]" checked={s.roundingMode === v} onChange={() => update((d) => void (d.settings.roundingMode = v as RoundingMode))} />
                <span>
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="num text-xs text-ink-3">{ex}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <Field label={t('tolerance')} hint="Short/excess up to this amount shows amber instead of red.">
          <MoneyInput value={s.tolerancePaise} onCommit={(v) => update((d) => void (d.settings.tolerancePaise = v))} />
        </Field>
      </Card>

      {/* Backup */}
      <Card className="p-4 sm:p-5">
        <SectionTitle icon={<Database className="h-5 w-5 text-brand" />} title={t('backup')} sub={cloud.mode === 'cloud' ? t('cloudBody') : t('savedLocal')} />
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => downloadFile(`fuel-ledger-backup_${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json')}>
            <Download className="h-4 w-4" /> {t('exportBackup')}
          </button>
          <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> {t('importBackup')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const parsed = JSON.parse(await f.text()) as AppData;
                if (parsed.version !== 1 || !parsed.settings || !parsed.days) throw new Error('bad');
                replace(parsed);
                toast(t('saved'));
              } catch {
                toast('Invalid backup file', 'warn');
              }
            }}
          />
          <button
            className="btn-ghost"
            onClick={() => {
              if (!confirm(t('confirmSample'))) return;
              replace(sampleData(data));
              setDate('2026-06-19');
              navigate('/');
            }}
          >
            <Sparkles className="h-4 w-4" /> {t('loadSample')}
          </button>
          <button
            className="btn-ghost ml-auto border-bad/40 text-bad hover:bg-bad-soft"
            onClick={() => {
              if (!confirm(t('confirmReset'))) return;
              const fresh = emptyData();
              fresh.settings.language = s.language;
              fresh.settings.theme = s.theme;
              replace(fresh);
              toast(t('resetAll'));
            }}
          >
            <RotateCcw className="h-4 w-4" /> {t('resetAll')}
          </button>
        </div>
      </Card>
    </div>
  );
}
