/** Paquet de cartes dessiné en CSS (aucune image hébergée). */
export function BoosterPack() {
  const crimp = "absolute inset-x-0 h-3 bg-[repeating-linear-gradient(90deg,rgb(0_0_0/0.25)_0_6px,transparent_6px_12px)]";
  return (
    <div className="relative h-72 w-48 overflow-hidden rounded-2xl bg-linear-to-br from-violet-600 via-fuchsia-500 to-amber-400 shadow-xl ring-1 ring-black/10 transition-transform duration-300 group-hover:-translate-y-2 group-hover:rotate-1 group-disabled:grayscale">
      <div className={`${crimp} top-0`} />
      <div className={`${crimp} bottom-0`} />
      <div className="absolute inset-x-4 inset-y-6 flex flex-col items-center justify-center rounded-xl border-2 border-white/40 text-white">
        <span className="text-6xl drop-shadow">🃏</span>
        <span className="mt-3 text-xl font-black tracking-[0.3em]">BOOSTER</span>
        <span className="text-xs opacity-80">5 cartes</span>
      </div>
      {/* Reflet au survol */}
      <div className="absolute inset-0 bg-linear-to-tr from-transparent via-white/35 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
    </div>
  );
}
