// api/reddit.js - Reddit AI 서브레딧에서 글 가져오기

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const subreddits = [
      'LocalLLaMA',
      'MachineLearning',
      'StableDiffusion',
      'singularity',
      'OpenAI',
      'ClaudeAI',
    ];
    
    const allPosts = [];
    const errors = [];
    
    // 최근 3일 내 (Unix timestamp, 초 단위)
    const threeDaysAgo = Date.now() / 1000 - 3 * 24 * 3600;
    
    for (const sub of subreddits) {
      try {
        // hot + new 둘 다 가져오기
        const [hotRes, newRes] = await Promise.all([
          fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=15`, {
            headers: { 'User-Agent': 'AIRadar/1.0' },
          }),
          fetch(`https://www.reddit.com/r/${sub}/new.json?limit=15`, {
            headers: { 'User-Agent': 'AIRadar/1.0' },
          }),
        ]);
        
        if (!hotRes.ok) throw new Error(`HTTP ${hotRes.status}`);
        
        const hotData = await hotRes.json();
        const newData = newRes.ok ? await newRes.json() : { data: { children: [] } };
        
        const allChildren = [
          ...(hotData?.data?.children || []),
          ...(newData?.data?.children || []),
        ];
        
        // 중복 제거
        const seen = new Set();
        const uniqueChildren = allChildren.filter(({ data }) => {
          if (seen.has(data.id)) return false;
          seen.add(data.id);
          return true;
        });
        
        const posts = uniqueChildren
          .filter(({ data: post }) => post.created_utc > threeDaysAgo)
          .map(({ data: post }) => ({
            id: `reddit-${post.id}`,
            title: post.title,
            url: `https://reddit.com${post.permalink}`,
            source: 'Reddit',
            score: post.score || 0,
            comments: post.num_comments || 0,
            date: new Date(post.created_utc * 1000).toISOString(),
            originalText: post.selftext || post.title,
            subreddit: sub,
          }));
        
        allPosts.push(...posts);
      } catch (e) {
        console.error(`Reddit ${sub} error:`, e);
        errors.push(`r/${sub}: ${e.message}`);
      }
    }
    
    // 점수순 정렬
    allPosts.sort((a, b) => b.score - a.score);
    
    return res.status(200).json({ 
      success: allPosts.length > 0, 
      data: allPosts.slice(0, 50),
      warnings: errors.length > 0 ? errors : null
    });
  } catch (err) {
    console.error('Reddit error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
