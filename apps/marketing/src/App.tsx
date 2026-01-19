import { Markdown } from '@craft-agent/ui/markdown'
import { CardBeamAnimation } from './components/CardBeamAnimation'

const article = `
# Craft Agent

Craft Agent is an AI-powered desktop application that helps you work seamlessly across your data sources. Built on Claude, it connects your documents, code repositories, APIs, and tools into a unified conversational interface where you can search, analyze, and create without switching contexts.

## Connect Everything

Whether it's your Craft documents, GitHub repositories, Linear issues, Obsidian notes, or custom REST APIs—Craft Agent brings them all together. Configure MCP servers or connect directly to services with OAuth, and let AI traverse your entire knowledge graph to find answers and complete tasks.

## Work Naturally

Instead of learning different interfaces for each tool, just describe what you need. Craft Agent understands context, maintains conversation history, and can execute multi-step workflows that span multiple data sources. It's like having a research assistant who knows where everything is.

## Built for macOS

A native desktop experience with multi-session inbox management, keyboard-first navigation, and seamless integration with your existing workflow. Install with a single command and start connecting your world.

\`\`\`bash
curl -fsSL https://agents.craft.do/install-app.sh | bash
\`\`\`
`

export default function App() {
  return (
    <main className="relative min-h-screen bg-foreground-2 flex flex-col items-center">
      {/* Hero section with card beam animation */}
      <section className="relative w-full pt-16 pb-8">
        {/* Craft Agent logo */}
        <div className="flex justify-center mb-8">
          <svg className="w-[72px] h-[72px]" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(107, 101)" fill="#9570BE">
              <polygon points="46.4162423 305 46.4160764 247.039024 0 247.039062 0 61.9609375 46.4160764 61.9600509 46.4162423 4 270 4 270 106.8625 157.110868 106.862192 157.110868 202.136883 270 202.1375 270 305" />
            </g>
          </svg>
        </div>

        {/* Card beam animation */}
        <CardBeamAnimation />
      </section>

      {/* Content section */}
      <section className="w-full max-w-2xl px-6 py-12">
        <div className="text-[14px]">
          <Markdown>
            {article}
          </Markdown>
        </div>
      </section>
    </main>
  )
}
