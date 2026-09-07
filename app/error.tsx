'use client';

import React, { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App Error caught by Error Boundary:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="w-12 h-12 mx-auto rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 text-xl font-bold">
          !
        </div>
        <h2 className="text-lg font-bold text-neutral-200">Terjadi Kesalahan Aplikasi</h2>
        <p className="text-xs text-neutral-400 break-words font-mono bg-neutral-950 p-3 rounded-lg border border-neutral-800 text-left">
          {error?.message || 'Unknown client error'}
        </p>
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => reset()}
            className="flex-1 py-2 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold transition"
          >
            Coba Lagi
          </button>
          <button
            onClick={() => window.location.reload()}
            className="flex-1 py-2 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold transition"
          >
            Muat Ulang
          </button>
        </div>
      </div>
    </div>
  );
}
