/**
 * news-score.ts
 *
 * Uses Claude (Haiku) to score each candidate news item 0–100 for how likely
 * it is to be a genuine, high-impact stock market catalyst before we fire a
 * Telegram alert. Items below NEWS_SCORE_THRESHOLD are silently dropped.
 *
 * Fail-open: any API error gives a default score of 75 so real alerts are
 * never silenced by scoring failures.
 *
 * Config:
 *   ANTHROPIC_API_KEY      — required (Claude API key)
 *   NEWS_SCORE_THRESHOLD   — minimum score to send an alert, default 65
 */

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export interface ScoreResult {
  score:      number;   // 0–100
  reason:     string;   // one-sentence explanation
  actionable: boolean;  // score >= THRESHOLD
}

const THRESHOLD = parseInt(process.env.NEWS_SCORE_THRESHOLD ?? '65', 10);

export async function scoreNewsRelevance(
  title:     string,
  summary:   string,
  category:  string,
  ticker:    string | null,
  sentiment: string,
): Promise<ScoreResult> {
  const prompt = `You are a financial news relevance scorer for a stock market alerting system used by day traders.

Your job: rate whether this headline represents a genuine, high-impact catalyst that would move a stock price by 5% or more.

Category detected: ${category}
Ticker: ${ticker ?? 'unknown'}
Sentiment: ${sentiment}
Headline: "${title}"${summary ? `\nSummary: "${summary.slice(0, 300)}"` : ''}

Score 0–100 using this scale:
- 80–100: Definitive catalyst (FDA approval/rejection confirmed, merger/acquisition announced, earnings blowout with raised guidance, major government contract won, Phase 3 trial clear success/failure)
- 60–79: Likely market-moving (credible acquisition rumor, Phase 2/3 data readout, significant analyst upgrade with raised price target, notable partnership with financial terms)
- 40–59: Moderate (early-stage trial update, minor analyst note, small contract win, partnership without financials, industry commentary mentioning specific company)
- 0–39: Low relevance (generic sector news, vague speculation, old article being reshared with no new info, no specific named catalyst, regulatory background chatter)

Respond with JSON only, no markdown fences:
{"score": <integer>, "reason": "<one concise sentence explaining the score>"}`;

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 120,
      messages:   [{ role: 'user', content: prompt }],
    });

    const raw   = (response.content[0] as { type: string; text: string }).text.trim();
    // Strip accidental markdown fences if the model adds them
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(clean) as { score: number; reason: string };

    const score = Math.min(100, Math.max(0, Math.round(parsed.score)));
    return {
      score,
      reason:     parsed.reason ?? '',
      actionable: score >= THRESHOLD,
    };
  } catch (err) {
    // Fail-open: don't block alerts when scoring is unavailable
    console.warn('[news-score] scoring unavailable:', (err as Error).message);
    return { score: 75, reason: 'scoring-unavailable', actionable: true };
  }
}
