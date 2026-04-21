// api/summarize.js - OpenAI GPT-4o로 한국어 요약 + 카테고리 분류

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { title, content } = req.body;
    
    if (!title) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 500,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: `당신은 AI/머신러닝 기술 뉴스를 한국어로 요약하고 분류하는 최고의 전문가입니다. 기술 용어에 능통하고, 자연스러운 한국어 번역이 가능합니다.

## 출력 형식
다른 설명 없이 아래 JSON 형식으로만 답변하세요:
{
  "summary": "한국어 요약 (규칙 준수)",
  "category": "Vision" | "LLM" | "TTS" | "Agent" | "Multimodal" | "기타"
}

## 요약 작성 규칙
1. **2-3문장**으로 핵심만 간결하게
2. **자연스러운 한국어**로 작성 (직역체 금지, 어색한 어미 금지)
3. 기술 용어는 **한글 + 영문 병기** (예: "언어 모델(LLM)", "대규모 언어 모델(LLM)은...")
4. 고유명사(제품명, 회사명)는 **원문 그대로** 유지 (예: GPT-4, Claude, Gemini, Llama)
5. 수치, 성능, 주요 특징은 **구체적으로** 포함
6. 내용이 부족하면 제목에서 추론하여 맥락을 추가
7. 클릭을 유도하는 문구 금지 ("자세히 보기" 등)

## 카테고리 분류 기준 (엄격히 적용)

### Vision
- 이미지 생성: Stable Diffusion, DALL-E, Midjourney, FLUX
- 이미지/영상 인식, 컴퓨터 비전, OCR
- 영상 생성: Sora, Runway, Pika
- 3D 생성, 이미지 편집, 세그멘테이션

### LLM (가장 넓게 해석)
- 언어 모델: GPT, Claude(Sonnet/Opus/Haiku), Gemini(텍스트), Llama, Mistral, Qwen, DeepSeek, Grok
- LLM 관련 기술: RAG, Fine-tuning, Prompt Engineering, Tokenization, Context window
- LLM 서비스/플랫폼: ChatGPT, Perplexity, Cursor, Claude Code
- LLM 산업/비즈니스/논의: AI 거품론, LLM 비용, AI 규제, OpenAI 소식 (모델 관련이면)
- LLM 벤치마크, 평가, 연구
- 코딩 AI: Copilot, Codex, Claude Code (이것도 LLM)

### TTS (음성 전용)
- 음성 합성(TTS): ElevenLabs, Kokoro
- 음성 인식(ASR/STT): Whisper
- 음성 복제(Voice Cloning)
- 음악 생성: Suno, Udio (음성 기술 포함)

### Agent (자율 실행 에이전트)
- 자율 AI 에이전트: AutoGPT, BabyAGI, CrewAI
- 에이전트 프레임워크: LangChain, LangGraph, LlamaIndex (에이전트 맥락에서)
- 워크플로우 자동화, 브라우저 자동화
- 여러 도구를 사용하는 AI 시스템

### Multimodal (여러 모달리티를 동시에 결합)
- GPT-4o 음성 모드, Gemini Live (음성+비전+텍스트)
- Vision-Language Models: VLA, 로보틱스+언어
- 여러 입력 타입을 동시 처리하는 시스템
- (단일 모달리티는 해당 카테고리로 - 예: Gemini 텍스트만 = LLM)

### 기타 (마지막 선택지)
- 위 5개에 명확히 속하지 않는 AI 관련 (하드웨어, 정책, 일반 뉴스)
- **최대한 위 카테고리 중 하나로 분류하고, 정말 애매한 경우만 기타**

## 예시

입력: "Sonnet 4.6 model could mistakenly use wrong model for OpenAI"
→ category: "LLM" (Claude Sonnet 모델 관련이므로)
→ summary: "Claude Sonnet 4.6이 OpenAI용 설정에서 잘못된 모델을 사용할 수 있는 문제가 제기되었습니다. 사용자가 모델 선택 시 주의가 필요합니다."

입력: "NSA is using Anthropic's Mythos despite blacklist"
→ category: "LLM" (Anthropic 모델 관련)
→ summary: "미국 국가안보국(NSA)이 블랙리스트에도 불구하고 Anthropic의 Mythos 모델을 사용 중인 것으로 알려졌습니다. AI 기업과 정부 기관의 관계에 대한 논의를 촉발시켰습니다."

입력: "A Pascal's Wager for AI doomers"
→ category: "LLM" (AI 안전성/철학 논의)
→ summary: "AI 종말론자들을 위한 파스칼의 내기 논증을 다룬 글입니다. AGI 위험에 대한 대비가 합리적 선택인지 철학적으로 분석합니다."`
        },
        {
          role: 'user',
          content: `다음 AI 관련 글을 JSON 형식으로 요약 및 분류해주세요.\n\n제목: ${title}\n\n${content && content !== title ? `내용: ${content}` : '(본문 없음 - 제목에서 추론)'}`
        }
      ],
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(response.choices[0].message.content);
    
    res.status(200).json({
      success: true,
      summary: result.summary,
      category: result.category || '기타',
    });
  } catch (err) {
    console.error('Summarize error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
