import Link from 'next/link';
import Image from 'next/image';
import { Button } from '../client/components/ui/button';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <Image
              src="/images/logo/icon.png"
              alt="TraduLibras Logo"
              width={28}
              height={28}
              className="rounded-full"
            />
            <span className="font-bold">TraduLibras</span>
          </Link>
          <nav className="hidden md:flex gap-6">
            <Link
              href="/about"
              className="text-sm font-medium transition-colors hover:text-primary"
            >
              Sobre
            </Link>
            <Link
              href="/translator"
              className="text-sm font-medium transition-colors hover:text-primary"
            >
              Tradutor
            </Link>
            <Link
              href="/learn"
              className="text-sm font-medium transition-colors hover:text-primary"
            >
              Aprender
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="outline" size="sm">
                Login
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Registrar</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="w-full py-12 md:py-24 lg:py-32 bg-[#3B3F46]">
          <div className="container px-4 md:px-6">
            <div className="grid gap-6 lg:grid-cols-[1fr_400px] lg:gap-12 xl:grid-cols-[1fr_600px]">
              <div className="flex flex-col justify-center space-y-4">
                <div className="space-y-2">
                  <h1 className="text-3xl text-white font-bold tracking-tighter sm:text-5xl xl:text-6xl/none">
                    Traduzindo palavras em inclusão
                  </h1>
                  <p className="max-w-[600px] text-gray-300 md:text-xl">
                    A plataforma que conecta a comunicação por meio da tradução
                    automatizada para Libras, tornando a inclusão digital uma
                    realidade.
                  </p>
                </div>
                <div className="flex flex-col gap-2 min-[400px]:flex-row">
                  <Link href="/translator">
                    <Button className="bg-[#FD8700] hover:bg-[#FD8700]/90">
                      Começar agora
                    </Button>
                  </Link>
                </div>
              </div>
              <div className="flex items-center justify-center">
                <Image
                  src="/images/logo/full-logo.png"
                  alt="TraduLibras"
                  width={500}
                  height={200}
                  className="rounded-lg object-cover"
                />
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
