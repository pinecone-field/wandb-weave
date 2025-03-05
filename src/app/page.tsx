import WeaveEvaluator from '@/components/WeaveEvaluator'

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-center">
          Weave Response Evaluator
        </h1>
        <WeaveEvaluator />
      </div>
    </main>
  )
}
