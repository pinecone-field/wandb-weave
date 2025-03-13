import { NextResponse } from 'next/server'

function getRunName(): string {
  const now = new Date()
  return `query-weave-evaluator-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    console.log('wandb route received:', payload);

    // Add run name to payload
    payload.run_name = getRunName();

    const weaveResponse = await fetch('http://127.0.0.1:5328/cgi-bin/weave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!weaveResponse.ok) {
      const errorText = await weaveResponse.text();
      console.error('Weave error response:', errorText);
      throw new Error(`Weave evaluation failed: ${weaveResponse.statusText}\n${errorText}`);
    }

    return NextResponse.json(await weaveResponse.json());
  } catch (error) {
    console.error('Evaluation error:', error);
    return NextResponse.json({ error: 'Failed to evaluate responses' }, { status: 500 });
  }
} 