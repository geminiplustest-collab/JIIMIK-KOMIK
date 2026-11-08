/**
 * Jiimik — JIYYAD TOOLS
 * Proxy Shinigami API (api.shngm.io)
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const API = 'https://api.shngm.io';
const SITE = 'https://11.shinigami.asia';
const UA =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36';

app.use(cors());
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const http = axios.create({
  baseURL: API,
  timeout: 30000,
  headers: {
    'User-Agent': UA,
    Accept: 'application/json',
    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
    Origin: SITE,
    Referer: SITE + '/',
  },
  validateStatus: () => true,
});

function arr(x) {
  return Array.isArray(x) ? x : [];
}
function tax(t, k) {
  return arr(t && t[k])
    .map((x) => (typeof x === 'string' ? x : x.name || x.title || ''))
    .filter(Boolean);
}
function fmtManga(m) {
  if (!m) return null;
  const id = m.manga_id || m.id || '';
  return {
    id,
    title: m.title || m.name || '',
    alt: m.alternative_title || '',
    cover: m.cover_portrait_url || m.cover_image_url || m.cover || '',
    country: m.country_id || '',
    status: m.status,
    rating: m.user_rate || m.rating || m.score || '',
    views: m.view_count || 0,
    bookmarks: m.bookmark_count || 0,
    latest_chapter: m.latest_chapter_number ?? '',
    description: m.description || m.synopsis || '',
    genres: tax(m.taxonomy, 'Genre'),
  };
}
function fmtChapter(c) {
  return {
    id: c.chapter_id || c.id || '',
    number: c.chapter_number ?? '',
    title: c.chapter_title || c.title || '',
    released: c.release_date || c.created_at || '',
    thumbnail: c.chapter_thumbnail_url || c.thumbnail_image_url || '',
  };
}

async function apiGet(p) {
  const { data, status } = await http.get(p);
  if (status >= 400) throw new Error((data && (data.message || data.error)) || 'HTTP ' + status);
  if (data && data.retcode !== undefined && data.retcode !== 0)
    throw new Error(data.message || 'retcode ' + data.retcode);
  return data;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'Jiimik', brand: 'JIYYAD TOOLS' });
});

app.get('/api/home', async (_req, res) => {
  try {
    const [latest, popular, top] = await Promise.all([
      apiGet('/v1/manga/list?page=1&page_size=24&sort=latest'),
      apiGet('/v1/manga/list?page=1&page_size=24&sort=bookmark'),
      apiGet('/v1/manga/top'),
    ]);
    res.json({
      status: true,
      latest: arr(latest.data).map(fmtManga),
      popular: arr(popular.data).map(fmtManga),
      top: arr(top.data).map(fmtManga).slice(0, 24),
    });
  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const page = req.query.page || 1;
    if (!q) return res.json({ status: true, results: [], meta: {} });
    const j = await apiGet(
      `/v1/manga/list?page=${page}&page_size=24&sort=latest&q=${encodeURIComponent(q)}`
    );
    res.json({
      status: true,
      results: arr(j.data).map(fmtManga),
      meta: j.meta || {},
    });
  } catch (e) {
    res.status(500).json({ status: false, error: e.message, results: [] });
  }
});

app.get('/api/manga/:id', async (req, res) => {
  try {
    const j = await apiGet('/v1/manga/detail/' + req.params.id);
    const d = j.data || {};
    res.json({
      status: true,
      manga: {
        ...fmtManga(d),
        alt: d.alternative_title || d.alt_title || '',
        genres: tax(d.taxonomy, 'Genre'),
        authors: tax(d.taxonomy, 'Author'),
        artists: tax(d.taxonomy, 'Artist'),
        formats: tax(d.taxonomy, 'Format'),
      },
    });
  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

app.get('/api/chapters/:id', async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const size = Number(req.query.size || 50);
    const j = await apiGet(
      `/v1/chapter/${req.params.id}/list?page=${page}&page_size=${size}&sort_by=chapter_number&sort_order=desc`
    );
    res.json({
      status: true,
      chapters: arr(j.data).map(fmtChapter),
      meta: j.meta || {},
    });
  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

app.get('/api/read/:chapterId', async (req, res) => {
  try {
    const j = await apiGet('/v1/chapter/detail/' + req.params.chapterId);
    const d = j.data || {};
    const c = d.chapter || {};
    const base = String(d.base_url || '').replace(/\/+$/, '');
    const p = String(c.path || d.path || '').replace(/^\/+|\/+$/g, '');
    const files = arr(c.data || d.images || d.pages);
    const pages = files.map((f) => {
      const s = String(f);
      if (/^https?:\/\//i.test(s)) return '/api/img?url=' + encodeURIComponent(s);
      const full = base + '/' + p + '/' + s.replace(/^\/+/, '');
      return '/api/img?url=' + encodeURIComponent(full);
    });
    res.json({
      status: true,
      chapter: {
        id: req.params.chapterId,
        manga_id: d.manga_id || '',
        number: d.chapter_number ?? '',
        title: d.chapter_title || '',
        total_pages: pages.length,
        pages,
        prev_chapter_id: d.prev_chapter_id || null,
        next_chapter_id: d.next_chapter_id || null,
        prev_chapter_number: d.prev_chapter_number,
        next_chapter_number: d.next_chapter_number,
      },
    });
  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

app.get('/api/img', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url || !/^https?:\/\//i.test(url)) return res.status(400).end();
    const r = await axios.get(url, {
      responseType: 'stream',
      timeout: 30000,
      headers: {
        'User-Agent': UA,
        Referer: SITE + '/',
        Origin: SITE,
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
      },
      validateStatus: () => true,
    });
    if (r.status >= 400) return res.status(r.status).end();
    if (r.headers['content-type']) res.set('Content-Type', r.headers['content-type']);
    res.set('Cache-Control', 'public, max-age=86400');
    r.data.pipe(res);
  } catch {
    res.status(502).end();
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Jiimik → http://localhost:${PORT}`));
