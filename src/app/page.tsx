'use client'

import dynamic from 'next/dynamic'

const WeaveEvaluator = dynamic(() => import('@/components/WeaveEvaluator'), { 
  ssr: false,
  loading: () => (
    <div className="animate-pulse p-8">
      <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
      <div className="h-32 bg-gray-200 rounded mb-4"></div>
    </div>
  )
})

export default function Home() {
  return (
    <main className="min-h-screen p-8 bg-white text-gray-900">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-center">
          Weave Response Evaluator
        </h1>
        <WeaveEvaluator />
      </div>
    </main>
  )
}
