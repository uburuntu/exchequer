# Exchequer

**[exchequer.rmbk.me](https://exchequer.rmbk.me)**

A privacy-first, offline-capable browser application for calculating UK Capital Gains Tax. All calculations run entirely in your browser with zero data sent to servers.

## Features

**Broker Support**
- Charles Schwab, Trading 212, Morgan Stanley (MSSB), Sharesight, Vanguard, Freetrade
- RAW CSV format for custom imports

**HMRC Compliance**
- Same-Day Rule: Match same-day acquisitions and disposals
- Bed & Breakfast Rule: Match disposals with acquisitions within 30 days
- Section 104 Pooling: Average cost basis for remaining shares

**Transaction Types**
- Buy/Sell, Stock activity (RSU vesting, ESPP)
- Dividends, Interest income
- Stock splits, Spin-offs, Corporate actions

**Technical**
- Decimal precision with banker's rounding (matches HMRC requirements)
- Complete type safety with TypeScript strict mode
- British Heritage Editorial design aesthetic

## Quick Start

```bash
pnpm install
pnpm dev
```

Open [localhost:5173](http://localhost:5173) and upload your broker CSV files.

### Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for production |
| `pnpm test` | Run tests |
| `pnpm check` | Type check |

## Privacy & Security

- **Zero server communication** — all processing happens in your browser
- **No analytics or tracking** — no cookies, no external requests
- **Open source** — full source code available for audit
- **Offline capable** — works without internet connection

## Browser Compatibility

Chrome 90+, Firefox 88+, Safari 14+ (ES2020 support required)

## Credits

Inspired by [capital-gains-calculator](https://github.com/KapJI/capital-gains-calculator) by KapJI (MIT License).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on adding new broker parsers and contributing to the project.

## Disclaimer

This calculator is provided for informational purposes only. Always consult with a qualified tax professional for advice specific to your circumstances. The developers make no warranty about the accuracy of calculations.

For HMRC guidance, see [gov.uk/capital-gains-tax](https://www.gov.uk/capital-gains-tax).

## License

[PolyForm Noncommercial License 1.0.0](LICENSE) — free for personal use, not for commercial purposes.
