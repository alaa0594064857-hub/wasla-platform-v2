
export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <h1 className="text-5xl font-bold tracking-wide">
        WASLA
      </h1>

      <p className="mt-3 text-xl font-semibold">
        وصلة
      </p>

      <div className="mt-5 h-1 w-24 rounded-full bg-[var(--wasla-gold)]" />

      <p className="mt-6 max-w-xl text-lg">
        منصة تجارية عالمية تجمع المتاجر والشركات
        والموردين والصفقات التجارية في مكان واحد.
      </p>

      <p className="mt-4 text-sm opacity-70">
        A Global Business & Commerce Platform
      </p>

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        {[
          "WASLA Store",
          "WASLA Shops",
          "WASLA Business",
          "WASLA Trade",
          "WASLA Messages",
          "WASLA AI",
        ].map((item) => (
          <div
            key={item}
            className="rounded-xl border border-[var(--wasla-gold)] px-5 py-3 font-semibold"
          >
            {item}
          </div>
        ))}
      </div>
    </main>
  );
}
