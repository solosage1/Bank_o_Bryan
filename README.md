# Bank o'Bryan - Family Banking Application

A playful virtual family bank designed for kids aged 10-14, with comprehensive parent management tools and real-time financial tracking.

## 🏦 Features

### For Parents
- **Google OAuth Authentication** - Secure login via Supabase Auth
- **Family Dashboard** - Live balance tickers for all children updating every second
- **Account Management** - Add/edit children with personalization options
- **Transaction Control** - Deposit/withdraw virtual money with date selection
- **Goal & Reward Management** - Create goals and track progress

### For Kids (10-14)
- **Live Balance Tracking** - Real-time balance updates via WebSockets
- **Transaction History** - Filterable history with CSV export capability
- **Financial Projections** - 12-month projections with interactive playground
- **Goals & Rewards** - Visual progress tracking and reward management
- **Personalization** - Avatar selection, themes, and nicknames

### Banking System
- **Tiered Interest Rates** - Virtual money earns interest based on balance tiers
- **Real-time Updates** - Balance changes propagate instantly via Supabase Realtime
- **Daily Interest Accrual** - Automated cron job for interest calculation
- **Audit Logging** - Comprehensive tracking of all financial activities

## 🚀 Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, shadcn/ui, Tailwind CSS
- **Backend**: Supabase (Postgres + Auth + Realtime + Cron)
- **Functions**: Supabase Edge Functions, Netlify Functions
- **Deployment**: Netlify with Supabase integration
- **Authentication**: Google OAuth via Supabase Auth

## 📦 Installation

### Prerequisites
- Node.js 18+ 
- Supabase account
- Google Cloud Console account (for OAuth)
- Netlify account (for deployment)

### 1. Clone and Install
```bash
git clone <repository-url>
cd bank-o-bryan
npm install
```

### 2. Supabase Setup
1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Copy your project URL and anon key
3. Set up Google OAuth in Supabase Auth settings:
   - Go to Authentication > Settings > Auth Providers
   - Enable Google provider
   - Add your Google OAuth credentials

### 3. Environment Variables
Create `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 4. Database Migration
```bash
# Install Supabase CLI
npm install -g supabase

# Login and link project
supabase login
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

### 5. Deploy Edge Functions
```bash
supabase functions deploy accrueInterest
supabase functions deploy projection
supabase functions deploy projectionWithSim
```

### 6. Local Development
```bash
npm run dev
```

## 🗄️ Database Schema

### Core Tables
- **families** - Family units with settings and timezone
- **parents** - Parent accounts linked to Google OAuth
- **children** - Child profiles with personalization
- **accounts** - Financial accounts for each child

### Financial Tables  
- **interest_tiers** - Configurable interest rate tiers
- **transactions** - All financial transactions (deposits, withdrawals, interest)
- **interest_runs** - Tracking of daily interest calculation jobs

### Feature Tables
- **goals** - Savings goals with target amounts and dates
- **rewards** - Reward system with delivery tracking  
- **audit_log** - Comprehensive activity logging

### Security
- **Row Level Security (RLS)** enabled on all tables
- **Family-scoped policies** ensure data isolation
- **Indexes** on frequently queried columns for performance

## 🔧 API Functions

### Edge Functions
1. **accrueInterest** - Daily cron job for calculating and applying interest
2. **projection** - Generate baseline 12-month financial projections
3. **projectionWithSim** - Generate projections with simulation parameters

### Key Features
- Proper error handling and logging
- Family-scoped data access
- Efficient interest calculation using Postgres functions
- Real-time balance updates via Supabase Realtime

## 🎨 Components Architecture

```
src/
├── app/                 # Next.js 14 App Router
│   ├── (auth)/         # Authentication routes
│   ├── dashboard/      # Parent dashboard
│   ├── child/         # Child-specific pages
│   └── api/           # API routes
├── components/
│   ├── ui/            # shadcn/ui components
│   ├── auth/          # Authentication components
│   ├── banking/       # Banking-specific components
│   └── shared/        # Shared components
├── hooks/             # Custom React hooks
├── lib/               # Utilities and Supabase client
└── types/             # TypeScript definitions
```

## 🔒 Security & Privacy

### Data Protection
- No real money transactions - virtual ledger only
- Family data isolation via RLS policies
- Secure OAuth integration
- Audit logging for compliance

### Access Control
- Parents can only access their family data
- Children cannot modify financial data
- Service role keys never exposed client-side
- Comprehensive error boundaries

## 📱 Responsive Design

- **Mobile-first approach** with Tailwind CSS
- **Breakpoints**: Mobile (<768px), Tablet (768-1024px), Desktop (>1024px)
- **Accessibility**: ARIA labels, keyboard navigation, focus management
- **Performance**: Optimized realtime subscriptions, efficient re-renders

## 🚀 Deployment

### Netlify Deployment
1. Connect your GitHub repository to Netlify
2. Set environment variables in Netlify dashboard (do not commit secrets)
3. Configure build settings:
   - Build command: `npm run build`
   - Publish directory: `.next`

### Environment Variables for Production
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### OAuth Redirect URLs
Add these URLs to your Google OAuth configuration:
- Development: `http://localhost:3000/auth/callback`
- Production: `https://your-netlify-domain.netlify.app/auth/callback`

## 📊 Performance

- **Real-time updates**: <250ms latency via WebSockets
- **Optimized queries**: Indexed database operations
- **Efficient subscriptions**: Table-specific realtime listeners
- **Caching**: Strategic use of React Query for data management

## 🧪 Testing

Run the test suite:
```bash
npm test
```

## 📝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For issues and questions:
1. Check the GitHub issues
2. Review Supabase documentation
3. Contact support team

---

**Bank o'Bryan** - Teaching kids financial responsibility through play! 🎯💰
## 🛠️ PRD Schema Update (2025-08-07)

A new migration file `supabase/migrations/20250807_prd_mvp.sql` introduces the `families`, `parents`, `children`, `accounts`, `transactions_prd`, `interest_runs_prd`, `interest_tiers_prd`, `goals`, `rewards` and `audit_log` tables to align the database with the Product Requirements Document (PRD).  Apply this migration after linking your Supabase project.  Existing legacy tables (`interest_tiers`, `transactions`, `interest_runs`) are left untouched for backward compatibility.

> **Security note**: `.env.local` must never be committed to source control.  The service role key grants admin access to your Supabase database and should only be loaded at runtime via your deployment platform’s secrets manager.
