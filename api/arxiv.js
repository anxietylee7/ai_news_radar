// api/arxiv.js - arXiv 수집 (30분 캐싱)

import { kv } from '@vercel/kv';

const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
};

const CACHE_KEY = 'arxiv:papers:v1';
const CACHE_TTL = 1800; // 30분

export default async function handler(req, res) {
  setCorsHeaders(res);
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // 🔍 캐시 확인
    try {
      const cached = await kv.get(CACHE_KEY);
      if (cached) {
        return res.status(200).json({ success: true, cached: true, data: cached });
      }
    } catch (e) {
      console.warn('arXiv cache read failed:', e.message);
    }

    const query = 'cat:cs.AI+OR+cat:cs.CL+OR+cat:cs.CV+OR+cat:cs.LG';
    const url = `https://export.arxiv.org/api/query?search_query=${query}&sortBy=submittedDate&sortOrder=descending&max_results=30`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const text = await response.text();
    
    const entries = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    const matches = text.matchAll(entryRegex);
    
    const threeDaysAgo = Date.now() - 3 * 24 * 3600 * 1000;
    
    for (const match of matches) {
      const entryXml = match[1];
      
      const titleMatch = entryXml.match(/<title>([\s\S]*?)<\/title>/);
      const summaryMatch = entryXml.match(/<summary>([\s\S]*?)<\/summary>/);
      const idMatch = entryXml.match(/<id>([\s\S]*?)<\/id>/);
      const publishedMatch = entryXml.match(/<published>([\s\S]*?)<\/published>/);
      
      if (titleMatch && idMatch) {
        const id = idMatch[1].trim();
        const title = titleMatch[1].trim().replace(/\s+/g, ' ');
        const summary = summaryMatch ? summaryMatch[1].trim() : '';
        const published = publishedMatch ? publishedMatch[1].trim() : new Date().toISOString();
        
        if (new Date(published).getTime() < threeDaysAgo) continue;
        
        entries.push({
          id: `arxiv-${id.split('/').pop()}`,
          title: title,
          url: id,
          source: 'arXiv',
          score: 0,
          comments: 0,
          date: published,
          originalText: summary,
        });
      }
    }
    
    // 💾 캐싱
    try {
      await kv.set(CACHE_KEY, entries, { ex: CACHE_TTL });
    } catch (e) {
      console.warn('arXiv cache write failed:', e.message);
    }
    
    res.status(200).json({ success: true, cached: false, data: entries });
  } catch (err) {
    console.error('arXiv error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
