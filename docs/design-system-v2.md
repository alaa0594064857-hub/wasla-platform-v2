# WASLA V2 — Global Design System

Status: foundational product design direction  
Brand: temporary working identity (must remain replaceable)  
Primary markets: international first, Arabic-speaking markets fully supported  
Platforms: responsive web, Android, iOS

## 1. Product design goals

- Make the platform feel trustworthy, premium, global, and commercially useful.
- Optimize every key journey for clarity and conversion, not decoration alone.
- Keep buyer, seller, company, supplier, and trader experiences coherent while respecting their different jobs.
- Design mobile-first, then scale gracefully to tablet and desktop.
- Support Arabic RTL and English LTR as first-class layouts, not translated afterthoughts.
- Meet accessibility basics: keyboard focus, readable contrast, clear labels, reduced-motion support, and usable touch targets.

## 2. Brand flexibility

The current WASLA name and visual identity are provisional. Product code must not scatter brand names, logos, or colors through business logic. Centralize brand metadata and design tokens so a future rename or identity refresh does not require rewriting product features.

## 3. Visual direction

- Core palette: deep navy, restrained warm gold, and soft cream, with white surfaces and neutral text colors.
- Use strong typography hierarchy, generous spacing, deliberate alignment, and clear visual grouping.
- Prefer real product, business, and editorial imagery over generic decorative gradients.
- Use subtle depth, borders, and motion to communicate hierarchy and interaction; avoid excessive glass effects, glow, or animation.
- Use consistent iconography and illustration style across modules.

## 4. Conversion principles

- Each public page should explain its audience, value, and next action quickly.
- Calls to action must be specific and consistent.
- Subscription pages must compare benefits transparently and avoid fabricated user counts, testimonials, badges, or performance claims.
- Build trust through clear policies, contact/support routes, secure account patterns, and honest product information.
- Reduce registration friction and explain why each requested field is needed.

## 5. Experience architecture

The ecosystem is organized into:
1. Store — product discovery and purchasing.
2. Shops — storefront creation and seller operations.
3. Business — company and supplier discovery and profiles.
4. Trade — commercial opportunities, offers, and deal workflows.
5. Messages — customer and business communication.
6. AI — contextual assistance and operational tools.
7. Admin — secure platform governance and support.

Shared foundations: one account, profile, notifications, search, localization, permissions, and consistent navigation.

## 6. Design and engineering acceptance checklist

For each new or redesigned screen:
- Arabic and English content fit naturally; direction, alignment, numbers, and mixed-language text are checked.
- Layout is tested at narrow mobile, tablet, and desktop widths.
- Loading, empty, error, success, and permission-denied states are designed.
- Primary actions are visually obvious and keyboard/touch accessible.
- Components reuse shared tokens and patterns rather than one-off styling.
- No invented social proof, fake metrics, or non-functional controls.
- Existing authentication, API contracts, and data flows are preserved unless a deliberate migration is planned.
- Performance and reduced-motion preferences are respected.

## 7. Delivery sequence

1. Audit current routes, shared components, API contracts, and responsive behavior.
2. Establish centralized brand metadata and reusable design tokens.
3. Redesign the public landing and registration/entry journey.
4. Upgrade Store and Shops discovery and seller journeys.
5. Upgrade Business and Trade workflows.
6. Upgrade Messages, AI, and Admin surfaces.
7. Run regression, accessibility, localization, and responsive checks before release.

## 8. Non-goals

- Do not migrate the old V1 HTML pages into V2.
- Do not rename the product throughout the codebase before a final brand decision.
- Do not sacrifice functional reliability for visual effects.
- Do not introduce subscription billing or pricing promises until plans, entitlements, and payment flows are defined.
