/**
 * Community: what people share about each design, on the dream.sc copy of the forge
 * (it needs dreamDB; every entry belongs to whoever wrote it, so people can only
 * change their own, and the forge's owners can remove anything).
 *
 *   downloads   a shared tally per design (dreamDB counters)
 *   my notes    private notes per design, kept in this browser only
 *   reviews     notes and stars anyone signed in can leave on a design
 *   versions    "share my version": a design's settings, with a name and a note,
 *               that anyone can open and change
 *   map         where visits come from, by country and region (signed-in only)
 */
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const NOTES = 'dragonhub-notes'
const rid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
const ago = (t) => { const s = (Date.now() - new Date(t).getTime()) / 1000; return s < 3600 ? `${Math.max(1, Math.round(s / 60))} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago` }

export function createCommunity({ db, onOpenVersion, status }) {
  const on = !!db
  let counts = new Map(), me = null
  const counted = new Set()
  const notesAll = () => { try { return JSON.parse(localStorage.getItem(NOTES) || '{}') } catch { return {} } }

  async function refreshCounts() {
    if (!on) return
    try { counts = new Map((await db.counts()).map((c) => [c.name, c.n])) } catch {}
  }
  if (on) {
    db.me().then((m) => (me = m)).catch(() => {})
    refreshCounts()
    // note this visit once a day (country and region only)
    try {
      const day = new Date().toISOString().slice(0, 10)
      if (localStorage.getItem('dragonhub-visit') !== day) { localStorage.setItem('dragonhub-visit', day); db.visit().catch(() => {}) }
    } catch {}
  }

  return {
    on,
    downloads: (id) => counts.get('dl/' + id) || 0,
    /** a download of this design: counted once per design per visit */
    downloaded(id) {
      if (!on || counted.has(id)) return
      counted.add(id)
      counts.set('dl/' + id, (counts.get('dl/' + id) || 0) + 1)
      db.count('dl/' + id).catch(() => {})
    },

    /** the panel under a design's settings */
    panel(d, currentSettings) {
      const det = document.createElement('details')
      det.className = 'finishPanel commPanel'
      const n = counts.get('dl/' + d.id) || 0
      det.innerHTML = `<summary>💬 Notes, reviews and versions${on && n ? ` <small>· ⬇ ${n}</small>` : ''}</summary><div></div>`
      const box = det.lastChild
      // my notes (private)
      const notes = notesAll()
      box.insertAdjacentHTML('beforeend', `<label class="cl">My notes <small>(only you see these, on this computer)</small></label><textarea class="cnote" rows="3" placeholder="Print settings that worked, what to change next time…"></textarea>`)
      const ta = box.querySelector('.cnote')
      ta.value = notes[d.id] || ''
      let t = 0
      ta.oninput = () => { clearTimeout(t); t = setTimeout(() => { const all = notesAll(); if (ta.value.trim()) all[d.id] = ta.value; else delete all[d.id]; try { localStorage.setItem(NOTES, JSON.stringify(all)) } catch {} }, 400) }
      if (!on) {
        box.insertAdjacentHTML('beforeend', '<div class="hint">Reviews, shared versions and the download tally are on the dream.sc copy of the forge, for anyone signed in.</div>')
        return det
      }
      box.insertAdjacentHTML('beforeend', `<div class="hint">⬇ ${n} download${n === 1 ? '' : 's'}</div>
        <label class="cl">Reviews and tips</label><div class="clist" data-k="review"></div>
        <div class="cform"><select class="cstars" aria-label="Stars"><option value="0">no stars</option>${[5, 4, 3, 2, 1].map((s) => `<option value="${s}">${'★'.repeat(s)}</option>`).join('')}</select><textarea class="ctext" rows="2" maxlength="1500" placeholder="How did it print and spin? Tips for others…"></textarea><button class="btn">Post</button></div>
        <label class="cl">Versions people have shared</label><div class="clist" data-k="ver"></div>
        <div class="cform"><input class="vname" maxlength="60" placeholder="Name your version"><textarea class="vnote" rows="2" maxlength="600" placeholder="What you changed and why (optional)"></textarea><button class="btn">Share my version</button></div>
        <div class="hint">Shared as your account name. You can delete your own posts.</div>`)
      const lists = box.querySelectorAll('.clist')
      const load = async () => {
        let rows = []
        try { rows = await db.list(`c/${d.id}/`) } catch (e) { lists.forEach((l) => (l.innerHTML = '<div class="hint">Could not load.</div>')); return }
        rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        for (const l of lists) {
          const kind = l.dataset.k
          const mine = rows.filter((r) => r.key.split('/')[2] === kind)
          l.innerHTML = mine.length ? '' : `<div class="hint">${kind === 'review' ? 'No reviews yet: be the first.' : 'No shared versions yet.'}</div>`
          for (const r of mine) {
            const v = r.value || {}
            const el = document.createElement('div')
            el.className = 'citem'
            el.innerHTML = kind === 'review'
              ? `<div><b>${esc(r.by || 'someone')}</b> ${v.stars ? `<span class="stars">${'★'.repeat(v.stars)}</span>` : ''} <small>${ago(r.updatedAt)}</small></div><div>${esc(v.text)}</div>`
              : `<div><b>${esc(v.name || 'A version')}</b> <small>by ${esc(r.by || 'someone')} · ${ago(r.updatedAt)}</small></div>${v.note ? `<div>${esc(v.note)}</div>` : ''}<button class="btn openv">Open it</button>`
            if (r.mine || me?.canManage) {
              const x = document.createElement('button'); x.className = 'cdel'; x.textContent = 'Delete'; x.title = 'Delete'
              x.onclick = async () => { try { await db.remove(r.key); load() } catch (e) { status?.('Could not delete: ' + e.message) } }
              el.append(x)
            }
            el.querySelector('.openv')?.addEventListener('click', () => onOpenVersion(d, v))
            l.append(el)
          }
        }
      }
      const [rf, vf] = box.querySelectorAll('.cform')
      rf.querySelector('button').onclick = async () => {
        const text = rf.querySelector('.ctext').value.trim()
        if (!text) return rf.querySelector('.ctext').focus()
        try { await db.set(`c/${d.id}/review/${rid()}`, { text, stars: Number(rf.querySelector('.cstars').value) || 0 }); rf.querySelector('.ctext').value = ''; load() } catch (e) { status?.('Could not post: ' + e.message) }
      }
      vf.querySelector('button').onclick = async () => {
        const name = vf.querySelector('.vname').value.trim()
        if (!name) return vf.querySelector('.vname').focus()
        try { await db.set(`c/${d.id}/ver/${rid()}`, { name, note: vf.querySelector('.vnote').value.trim(), ...currentSettings() }); vf.querySelector('.vname').value = ''; vf.querySelector('.vnote').value = ''; load(); status?.('Shared: anyone can now open your version.') } catch (e) { status?.('Could not share: ' + e.message) }
      }
      det.addEventListener('toggle', () => { if (det.open) load() })
      return det
    },

    /** the world map of visits: dots by region, biggest first in a list */
    async showMap(dialog) {
      const box = dialog.querySelector('.mapbox')
      box.innerHTML = '<div class="hint">Loading…</div>'
      let rows = [], land = []
      try { [rows, land] = await Promise.all([db.visits(), fetch('world-land.json').then((r) => r.json())]) } catch { box.innerHTML = '<div class="hint">The map is for people signed in to dream.sc.</div>'; return }
      const W = 960, H = 480, X = (lon) => ((lon + 180) / 360) * W, Y = (lat) => ((90 - lat) / 180) * H
      const path = land.map((r) => 'M' + r.map(([lo, la]) => `${X(lo).toFixed(1)},${Y(la).toFixed(1)}`).join('L') + 'Z').join('')
      const max = Math.max(1, ...rows.map((r) => r.n))
      const dots = rows.filter((r) => r.lat || r.lon).map((r) => `<circle cx="${X(r.lon).toFixed(1)}" cy="${Y(r.lat).toFixed(1)}" r="${(3 + 14 * Math.sqrt(r.n / max)).toFixed(1)}"><title>${esc(r.country)}${r.region ? ' · ' + esc(r.region) : ''}: ${r.n} visit${r.n === 1 ? '' : 's'}</title></circle>`).join('')
      const total = rows.reduce((a, r) => a + r.n, 0)
      const byCountry = new Map()
      for (const r of rows) byCountry.set(r.country, (byCountry.get(r.country) || 0) + r.n)
      let names
      try { names = new Intl.DisplayNames(['en'], { type: 'region' }) } catch {}
      const top = [...byCountry].sort((a, b) => b[1] - a[1]).slice(0, 12)
      box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="worldmap" role="img" aria-label="Map of where visits come from"><path d="${path}" class="land"/>${dots}</svg>
        <div class="hint">${total} visit${total === 1 ? '' : 's'} from ${byCountry.size} countr${byCountry.size === 1 ? 'y' : 'ies'}, counted once a day per browser, by country and region only.</div>
        <ol class="toplist">${top.map(([c, n]) => `<li>${esc(names?.of(c) || c)} <small>${n}</small></li>`).join('')}</ol>`
    },
  }
}
