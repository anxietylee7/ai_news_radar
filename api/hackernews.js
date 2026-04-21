// api/hackernews.js - Hacker News에서 AI 관련 글 가져오기 (정규식 필터링)

// 긴 키워드 (단어 안에 포함돼도 OK - includes 방식)
const AI_CONTAINS_KEYWORDS = [
  'openai', 'anthropic', 'chatgpt', 'claude', 'huggingface', 'langchain',
  'llama', 'mistral', 'gemini', 'grok', 'qwen', 'deepseek',
  'midjourney', 'stable diffusion', 'dall-e', 'dalle',
  'elevenlabs', 'whisper', 'ollama', 'copilot',
  'machine learning', 'deep learning', 'neural network',
  'transformer', 'diffusion model', 'fine-tun', 'embedding',
  'autogpt', 'crewai', 'langgraph', 'llamaindex',
  'multimodal', 'vision-language', 'rag system',
  'text-to-image', 'text-to-video', 'speech recognition', 'speech synthesis',
];

// 짧은 키워드 (단어 경계 체크 - 정규식 \b 사용)
const AI_WORD_KEYWORDS = [
  'ai', 'llm', 'gpt', 'tts', 'stt', 'asr', 'vlm', 'mllm', 'sora',
  'agi', 'asi', 'rag', 'moe', 'nlp', 'cv', 'gan', 'vae',
  'prompt', 'token', 'agent', 'agentic', 'inference',
];

// 제외 키워드 (false positive 방지)
const EXCLUDE_KEYWORDS = [
  'aim', 'aid', 'aids', 'air', 'airplane', 'airport', 'aircraft',
  'aisle', 'tail', 'fail', 'email', 'retail', 'detail', 'available',
  'contain', 'explain', 'maintain', 'brain', 'train', 'rain',
  'bonsai', 'samurai', 'tokai', 'sensei',
];

const isAIRelated = (text) => {
  const lower = text.toLowerCase();

  // 1단계: 긴 키워드 (정확한 매칭)
  for (const kw of AI_CONTAINS_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }

  // 2단계: 짧은 키워드 (단어 경계 체크)
  // \b로 앞뒤가 단어 경계여야 매칭 (예: "ai" O, "bonsai" X)
  for (const kw of AI_WORD_KEYWORDS) {
    const pattern = new RegExp(`\\b${kw}\\b`, 'i');
    if (pattern.test(text)) {
      // 제외 키워드가 있으면 스킵
      const hasExcluded = EXCLUDE_KEYWORDS.some(ex => 
        lower.includes(ex)
      );
      // 제외 키워드가 있어도, 명확한 AI 키워드가 있으면 통과
      const hasStrongAI = AI_CONTAINS_KEYWORDS.some(k => lower.includes(k)) ||
        /\b(llm|gpt|ai model|ai research|ai tool|ai lab|openai|anthropic)\b/i.test(text);
      
      if (hasExcluded && !hasStrongAI) {
        // 제외 키워드만 있고 강한 AI 키워드는 없으면 통과 여부 결정
        // 여기서는 보수적으로 스킵
        continue;
      }
      return true;
    }
  }

  return false;
};

const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
};

export default async function handler(req, res) {
  setCorsHeaders(res);
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const [topRes, newRes] = await Promise.all([
      fetch('https://hacker-news.firebaseio.com/v0/topstories.json'),
      fetch('https://hacker-news.firebaseio.com/v0/newstories.json'),
    ]);
    
    if (!topRes.ok) throw new Error(`HN top stories failed: ${topRes.status}`);
    
    const topIds = await topRes.json();
    const newIds = newRes.ok ? await newRes.json() : [];
    
    const allIds = [...new Set([...topIds.slice(0, 60), ...newIds.slice(0, 40)])];
    
    const storyPromises = allIds.map(id =>
      fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
        .then(r => r.json())
        .catch(() => null)
    );
    
    const stories = await Promise.all(storyPromises);
    
    const threeDaysAgo = Date.now() / 1000 - 3 * 24 * 3600;
    
    const filtered = stories
      .filter(story => 
        story && 
        story.title && 
        story.time > threeDaysAgo &&
        isAIRelated(story.title)
      )
      .slice(0, 30)
      .map(story => ({
        id: `hn-${story.id}`,
        title: story.title,
        url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
        source: 'HackerNews',
        score: story.score || 0,
        comments: story.descendants || 0,
        date: new Date(story.time * 1000).toISOString(),
        originalText: story.title,
      }));
    
    res.status(200).json({ success: true, data: filtered });
  } catch (err) {
    console.error('HN error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
