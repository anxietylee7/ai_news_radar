// /api/items.js
// Supabase에서 누적된 모든 글 조회 (최근 30일치)

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 최근 30일치만 조회 (보존 기간)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('ai_news_items')
      .select('*')
      .gte('date', thirtyDaysAgo)
      .eq('is_ai_related', true)
      .order('date', { ascending: false })
      .limit(1000);
    
    if (error) {
      console.error('Items fetch error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
    
    // 프론트엔드 호환 형식으로 변환
    const items = (data || []).map(row => ({
      id: row.id,
      source: row.source,
      title: row.title,
      url: row.url,
      originalText: row.original_text,
      category: row.category,
      summaryKo: row.summary_ko,
      score: row.score,
      comments: row.comments,
      date: row.date,
    }));
    
    return res.status(200).json({
      success: true,
      data: items,
      count: items.length,
    });
    
  } catch (err) {
    console.error('Items handler error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
