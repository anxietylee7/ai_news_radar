// /api/collect.js
// 외부 소스(HN/arXiv/HF)에서 fetch → 캐싱 체크 → 새 글만 GPT 요약 → Supabase 저장

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============================================
// 외부 소스 fetcher들
// ============================================

async function fetchHackerNews() {
  try {
    const topRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
    const topIds = await topRes.json();
    const ids = topIds.slice(0, 100);
    
    const items = await Promise.all(
      ids.map(async (id) => {
        try {
          const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
          const item = await r.json();
          if (!item || !item.title) return null;
          return {
            id: `hn_${item.id}`,
            source: 'HackerNews',
            title: item.title,
            url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
            original_text: item.text || '',
            score: item.score || 0,
            comments: item.descendants || 0,
            date: new Date(item.time * 1000).toISOString(),
          };
        } catch (e) {
          return null;
        }
      })
    );
    
    return items.filter(Boolean);
  } catch (e) {
    console.error('HN fetch error:', e);
    return [];
  }
}

async function fetchArxiv() {
  try {
    const url = 'http://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.CL+OR+cat:cs.CV+OR+cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=30';
    const res = await fetch(url);
    const xml = await res.text();
    
    // 간단한 XML 파싱 (정규식)
    const entries = xml.split('<entry>').slice(1);
    return entries.map(entry => {
      const getTag = (tag) => {
        const match = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
        return match ? match[1].trim() : '';
      };
      
      const idFull = getTag('id');
      const arxivId = idFull.split('/').pop().replace('v1', '').replace('v2', '').replace('v3', '');
      const title = getTag('title').replace(/\s+/g, ' ').trim();
      const summary = getTag('summary').replace(/\s+/g, ' ').trim();
      const published = getTag('published');
      
      if (!arxivId || !title) return null;
      
      return {
        id: `arxiv_${arxivId}`,
        source: 'arXiv',
        title: title,
        url: idFull,
        original_text: summary,
        score: 0,
        comments: 0,
        date: published || new Date().toISOString(),
      };
    }).filter(Boolean);
  } catch (e) {
    console.error('arXiv fetch error:', e);
    return [];
  }
}

async function fetchHuggingFace() {
  try {
    const res = await fetch('https://huggingface.co/api/daily_papers');
    const data = await res.json();
    
    return (data || []).slice(0, 30).map(p => {
      const paper = p.paper || p;
      return {
        id: `hf_${paper.id || p.id}`,
        source: 'HuggingFace',
        title: paper.title || p.title,
        url: `https://huggingface.co/papers/${paper.id || p.id}`,
        original_text: paper.summary || p.summary || '',
        score: paper.upvotes || p.upvotes || 0,
        comments: paper.numComments || p.numComments || 0,
        date: paper.publishedAt || p.publishedAt || p.submittedOnDailyAt || new Date().toISOString(),
      };
    });
  } catch (e) {
    console.error('HF fetch error:', e);
    return [];
  }
}

// ============================================
// GPT-4o로 요약 + 카테고리 + AI 관련성 판단
// ============================================

async function summarizeWithGPT(item) {
  const prompt = `다음 글이 AI/머신러닝 관련인지 판단하고, 관련이라면 한국어 요약 + 카테고리 분류를 해주세요.

제목: ${item.title}
내용: ${(item.original_text || '').slice(0, 1500)}

JSON 형식으로만 응답:
{
  "isAIRelated": true/false,
  "category": "LLM" | "Vision" | "TTS" | "Agent" | "Multimodal" | "기타",
  "summaryKo": "한국어로 2-3문장 요약 (isAIRelated가 false면 빈 문자열)"
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: '당신은 AI 뉴스 큐레이터입니다. JSON으로만 응답하세요.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });
    
    const result = JSON.parse(completion.choices[0].message.content);
    return {
      isAIRelated: result.isAIRelated !== false,
      category: result.category || '기타',
      summaryKo: result.summaryKo || '',
    };
  } catch (e) {
    console.error('GPT error:', e);
    return { isAIRelated: true, category: '기타', summaryKo: '' };
  }
}

// ============================================
// 메인 핸들러
// ============================================

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const startTime = Date.now();
  
  try {
    // 1. 외부 소스 3개에서 fetch (병렬)
    console.log('Fetching from external sources...');
    const [hn, ax, hf] = await Promise.all([
      fetchHackerNews(),
      fetchArxiv(),
      fetchHuggingFace(),
    ]);
    
    const allFetched = [...hn, ...ax, ...hf];
    console.log(`Fetched total: ${allFetched.length} (HN: ${hn.length}, arXiv: ${ax.length}, HF: ${hf.length})`);
    
    if (allFetched.length === 0) {
      return res.status(200).json({
        success: false,
        error: 'No items fetched from external sources',
      });
    }
    
    // 2. 어떤 id가 이미 DB에 있는지 조회 (캐싱 체크)
    const fetchedIds = allFetched.map(i => i.id);
    const { data: existing, error: selectError } = await supabase
      .from('ai_news_items')
      .select('id')
      .in('id', fetchedIds);
    
    if (selectError) {
      console.error('Supabase select error:', selectError);
      return res.status(500).json({ success: false, error: selectError.message });
    }
    
    const existingIds = new Set((existing || []).map(e => e.id));
    const newItems = allFetched.filter(i => !existingIds.has(i.id));
    const cachedCount = allFetched.length - newItems.length;
    
    console.log(`Cached: ${cachedCount}, New (need GPT): ${newItems.length}`);
    
    // 3. 새 글만 GPT로 요약 (동시성 3, 비용 절감 핵심)
    const CONCURRENCY = 3;
    const enrichedNew = [];
    
    const processItem = async (item) => {
      const gptResult = await summarizeWithGPT(item);
      
      // AI 무관이면 저장 안 함 (DB 절약)
      if (!gptResult.isAIRelated) {
        console.log(`Filtered (not AI): ${item.title.slice(0, 50)}`);
        return null;
      }
      
      return {
        ...item,
        category: gptResult.category,
        summary_ko: gptResult.summaryKo,
        is_ai_related: true,
      };
    };
    
    // 동시성 제한 처리
    for (let i = 0; i < newItems.length; i += CONCURRENCY) {
      const batch = newItems.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(processItem));
      enrichedNew.push(...results.filter(Boolean));
    }
    
    // 4. 기존 글의 score/comments 업데이트 (선택사항이지만 인기도 정확성을 위해)
    // 빠른 처리를 위해 새 글만 INSERT, 기존 글은 score만 UPDATE
    let insertedCount = 0;
    let updatedCount = 0;
    
    if (enrichedNew.length > 0) {
      const { error: insertError } = await supabase
        .from('ai_news_items')
        .insert(enrichedNew);
      
      if (insertError) {
        console.error('Insert error:', insertError);
      } else {
        insertedCount = enrichedNew.length;
      }
    }
    
    // 기존 글의 score/comments 갱신 (HN/HF만 의미 있음)
    const existingItemsToUpdate = allFetched.filter(i => existingIds.has(i.id));
    for (const item of existingItemsToUpdate) {
      const { error } = await supabase
        .from('ai_news_items')
        .update({ 
          score: item.score, 
          comments: item.comments,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);
      
      if (!error) updatedCount++;
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    return res.status(200).json({
      success: true,
      duration: `${duration}s`,
      stats: {
        fetched: allFetched.length,
        cached: cachedCount,
        newWithGPT: newItems.length,
        inserted: insertedCount,
        scoreUpdated: updatedCount,
        filteredOutAsNotAI: newItems.length - insertedCount,
      },
    });
    
  } catch (err) {
    console.error('Collect error:', err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}
