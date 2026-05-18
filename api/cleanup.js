// /api/cleanup.js
// 30일 지난 글 자동 삭제
// Vercel Cron에서 매일 1회 호출하거나, 수동으로 GET 요청

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    // 삭제 전 개수 확인
    const { count: beforeCount } = await supabase
      .from('ai_news_items')
      .select('*', { count: 'exact', head: true });
    
    // 30일 이전 글 삭제
    const { error, count: deletedCount } = await supabase
      .from('ai_news_items')
      .delete({ count: 'exact' })
      .lt('date', thirtyDaysAgo);
    
    if (error) {
      console.error('Cleanup error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
    
    return res.status(200).json({
      success: true,
      beforeCount,
      deleted: deletedCount,
      afterCount: beforeCount - (deletedCount || 0),
      cutoffDate: thirtyDaysAgo,
    });
    
  } catch (err) {
    console.error('Cleanup handler error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
