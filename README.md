# Audit - Auditoria Logística Integrada (Beta)

## 📖 Sobre o Projeto

O **Audit** é uma aplicação web full-stack desenvolvida para automatizar e otimizar o processo de auditoria logística. O sistema permite a extração inteligente de dados de documentos aduaneiros e logísticos em formato PDF (como Declaração de Importação - DI, Packing Lists - PC, Notas Fiscais e Guias de Impostos), facilitando a conferência cruzada de valores e a geração de relatórios consolidados.

A ferramenta suporta diferentes modalidades logísticas:
- ✈️ Aéreo - Fortaleza
- 🚢 Marítimo - Pecém
- 🚢 Marítimo - Suape

## 🚀 Principais Funcionalidades

- **Extração com Inteligência Artificial:** Integração com a API do Google Gemini para leitura e interpretação avançada de documentos complexos.
- **Extração Local (Fallback):** Processamento rápido e offline via Regex e `pdfjs-dist` para documentos padronizados (ex: DI).
- **Conferência Cruzada com Tolerância:** Validação automática de divergências de valores com margem de tolerância configurável (ex: R$ 0,01 a R$ 0,10).
- **Exportação para Excel:** Geração de relatórios detalhados em `.xlsx` contendo todos os dados extraídos para auditoria final.
- **Painel Administrativo e Autenticação:** Controle de acesso seguro com JWT e painel para gestão de usuários e histórico de uso.
- **Processamento em Lote:** Capacidade de processar múltiplos arquivos PDF simultaneamente com barra de progresso e estimativa de tempo.

## 🛠️ Tecnologias Utilizadas

### Frontend
- **React 19** com TypeScript
- **Vite** (Bundler e Dev Server)
- **Tailwind CSS** (Estilização utilitária e design responsivo)
- **Lucide React** (Ícones)

### Backend
- **Node.js** com **Express**
- **SQLite3** (via `better-sqlite3`) para banco de dados local
- **JWT (JSON Web Tokens)** e **Bcrypt.js** para autenticação e segurança
- **Google GenAI SDK** (`@google/genai`) para processamento de IA

### Utilitários
- **PDF.js** (`pdfjs-dist`) para leitura de PDFs no cliente
- **XLSX** para geração de planilhas
- **UUID** para geração de identificadores únicos

## 📦 Como Executar o Projeto

### Pré-requisitos
- Node.js (v18 ou superior)
- NPM ou Yarn

### Instalação

1. Clone o repositório ou acesse o diretório do projeto.
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Configure as variáveis de ambiente criando um arquivo `.env` na raiz do projeto:
   ```env
   GEMINI_API_KEY=sua_chave_api_do_google_gemini
   JWT_SECRET=sua_chave_secreta_jwt
   ```

### Executando em Ambiente de Desenvolvimento

Para iniciar o servidor backend (Express) integrado com o frontend (Vite):

```bash
npm run dev
```
O aplicativo estará disponível em `http://localhost:3000`.

### Build para Produção

Para compilar o projeto para produção:

```bash
npm run build
```

## 📂 Estrutura do Projeto

- `/src/components/`: Componentes React reutilizáveis (DropZone, ResultCard, AuthPanel, AdminDashboard).
- `/src/services/`: Lógica de negócios e integrações (Gemini API, Extração Local, Geração de Excel).
- `/server/`: Código do backend Express, rotas da API e configuração do banco de dados SQLite.
- `/App.tsx`: Ponto de entrada principal da interface do usuário.
- `/server.ts`: Ponto de entrada do servidor backend.

## 🛡️ Regras e Boas Práticas Adotadas

- **Separação de Responsabilidades:** O processamento pesado de PDF e IA é isolado em serviços (`services/`), mantendo os componentes UI limpos.
- **Feedback Visual:** Uso de spinners, barras de progresso e mensagens claras para manter o usuário informado durante o processamento de arquivos.
- **Segurança:** Senhas hasheadas no banco de dados e rotas de API protegidas por tokens JWT.
- **Design Responsivo:** Interface construída com Tailwind CSS seguindo o conceito Mobile-First, mas otimizada para uso em desktops (comum em ambientes corporativos).
