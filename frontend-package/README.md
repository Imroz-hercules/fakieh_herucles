# Hercules - Water Monitoring System

A cutting-edge industrial water treatment facility monitoring dashboard with advanced 3D visualizations, holographic effects, and cyberpunk-inspired aesthetics.

## Features

🌊 **Advanced Water Facility Management**
- Real-time monitoring of 10 Saudi Arabian water treatment facilities
- Interactive holographic network topology with animated data flows
- 3D gauge visualizations for flow rate, pressure, energy, and quality metrics
- Comprehensive analytics panels with heat maps and radar charts

⚡ **Futuristic 3D Interface**
- Cyberpunk-themed industrial dashboard design
- Advanced 3D hover effects and animations
- Professional Hercules v2.0 branding integration
- Responsive design optimized for industrial monitoring

🏭 **Multi-Page Dashboard System**
- Main Dashboard: All facilities overview with interactive map
- Facility Overview: Plant layout with live component monitoring
- Process Flow: Animated process diagrams with real-time data
- Water Quality: Lab vs inline analysis with compliance tracking
- Energy Monitoring: Power consumption analytics and optimization
- Maintenance: Active alarm management and MTBF analysis
- Chemical Dosing: Tank levels and dosing control systems

## Technology Stack

- **Frontend**: React 18 with TypeScript, Vite build system
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM (configured for in-memory storage)
- **UI**: shadcn/ui components with Radix UI primitives
- **Styling**: Tailwind CSS with custom cyberpunk theme
- **Charts**: Chart.js for advanced data visualization
- **State Management**: TanStack Query for server state management
- **Routing**: Wouter for lightweight client-side routing

## Quick Start

### Prerequisites
- Node.js 18 or higher
- npm or yarn package manager

### Installation

1. **Extract the project**
   ```bash
   tar -xzf hercules-water-monitoring-complete.tar.gz
   cd hercules-water-monitoring-complete
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:5000`

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run db:generate` - Generate database migrations
- `npm run db:migrate` - Run database migrations

## Project Structure

```
hercules-water-monitoring/
├── client/                 # React frontend application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   │   ├── ui/        # shadcn/ui components
│   │   │   └── ...        # Custom dashboard components
│   │   ├── pages/         # Page components and routing
│   │   ├── lib/           # Utilities and configuration
│   │   └── hooks/         # Custom React hooks
├── server/                # Express backend application
│   ├── index.ts          # Server entry point
│   ├── routes.ts         # API route definitions
│   └── storage.ts        # In-memory data storage
├── shared/               # Shared types and schemas
│   └── schema.ts         # Database schema and types
└── package.json          # Project dependencies
```

## Dashboard Pages

### Main Dashboard (`/`)
- Overview of all 10 Saudi Arabian facilities
- Interactive network topology map
- Real-time KPI visualization cards
- System performance metrics

### Facility Overview (`/facility/:id`)
- Detailed plant layout with interactive hotspots
- Individual facility KPIs and metrics
- Environmental impact tracking
- Shift summary and operational status

### Process Flow (`/process-flow`)
- Animated process flow diagrams
- Real-time equipment status monitoring
- Process bottleneck identification
- Interactive pump and valve controls

### Water Quality (`/water-quality`)
- Lab vs inline quality parameter comparison
- Regulatory compliance monitoring
- Automated report generation
- Quality trend analysis

### Energy Monitoring (`/energy-monitoring`)
- Power consumption analytics (kWh/m³)
- Electrical parameter monitoring
- Generator status and renewable energy tracking
- Cost optimization recommendations

### Maintenance (`/maintenance`)
- Active alarm management by severity
- MTBF (Mean Time Between Failures) analysis
- Planned vs unplanned maintenance tracking
- Equipment health monitoring

### Chemical Dosing (`/chemical-dosing`)
- Real-time chemical dosing rates
- Tank level monitoring and alerts
- Usage forecasting vs actual consumption
- Automated refill scheduling

## Configuration

### Environment Variables
The application uses in-memory storage by default. For production deployment with PostgreSQL:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/hercules
```

### Customization
- **Styling**: Modify `client/src/index.css` for theme customization
- **Data Sources**: Update `server/storage.ts` for real data integration
- **Facility Configuration**: Edit `shared/schema.ts` for facility definitions

## Development

### Adding New Features
1. Define data types in `shared/schema.ts`
2. Update storage interface in `server/storage.ts`
3. Add API routes in `server/routes.ts`
4. Create frontend components in `client/src/components/`
5. Add pages in `client/src/pages/` and register in `client/src/App.tsx`

### Database Integration
The project is configured for PostgreSQL with Drizzle ORM. To enable database storage:
1. Set `DATABASE_URL` environment variable
2. Run `npm run db:generate` to create migrations
3. Run `npm run db:migrate` to apply schema changes

## Production Deployment

### Building for Production
```bash
npm run build
```

### Deployment Options
- **Replit**: Configured for autoscale deployment
- **Docker**: Containerized deployment support
- **Traditional hosting**: Static + Node.js server deployment

## Support

For technical support or feature requests, refer to the project documentation in `replit.md`.

## License

This project is developed as a prototype demonstration for water treatment facility monitoring systems.