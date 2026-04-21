// api/huggingface.js - HuggingFace Papers에서 큐레이션된 AI 논문 가져오기

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 최근 3일치 데이터 가져오기
    const today = new Date();
    const dates = [];
    for (let i = 0; i < 3; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
    }

    const allPapers = [];
    const errors = [];

    for (const date of dates) {
      try {
        // HuggingFace Papers 특정 날짜 페이지
        const response = await fetch(
          `https://huggingface.co/api/daily_papers?date=${date}`,
          {
            headers: {
              'User-Agent': 'AIRadar/1.0',
              'Accept': 'application/json',
            },
          }
        );

        if (!response.ok) {
          // API가 실패하면 HTML 페이지에서 파싱 시도
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (Array.isArray(data)) {
          const papers = data.map(item => {
            const paper = item.paper || item;
            return {
              id: `hf-${paper.id || paper.arxivId || Math.random()}`,
              title: paper.title || '',
              url: paper.id 
                ? `https://huggingface.co/papers/${paper.id}` 
                : `https://arxiv.org/abs/${paper.arxivId}`,
              source: 'HuggingFace',
              score: paper.upvotes || item.upvotes || 0,
              comments: paper.numComments || 0,
              date: paper.publishedAt || item.publishedAt || `${date}T00:00:00.000Z`,
              originalText: paper.summary || paper.abstract || paper.title || '',
            };
          }).filter(p => p.title);

          allPapers.push(...papers);
        }
      } catch (e) {
        console.error(`HF ${date} error:`, e);
        errors.push(`${date}: ${e.message}`);
      }
    }

    // 중복 제거 (같은 논문이 여러 날짜에 올라올 수 있음)
    const seen = new Set();
    const uniquePapers = allPapers.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    // upvote 순 정렬
    uniquePapers.sort((a, b) => b.score - a.score);

    return res.status(200).json({
      success: uniquePapers.length > 0,
      data: uniquePapers.slice(0, 50),
      warnings: errors.length > 0 ? errors : null,
    });
  } catch (err) {
    console.error('HuggingFace error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
