# AidPal — Requirements Document

**Status:** Draft v0.1 (requirements-gathering phase)
**Last updated:** 2026-10-06
**Owner:** (you)

> This is a first draft built from the initial description. Items marked **[ASSUMPTION]** are my best guess and need your confirmation. Items marked **[OPEN]** are questions still to be answered. Nothing here is final.

---

## 1. Vision

AidPal is a social networking platform for civic and community good. It connects people around places and causes, lets them form groups, share photos and videos, organize and project-manage events, and contribute time (volunteering) or money (donations) to those events. Its signature idea is letting a user become a **"Friend of"** a structure, city, or country — pledging to gather and share information about it, volunteer when needed, and help organize events for it.

**One-line pitch:** A social network that turns community goodwill into organized action.

---

## 2. Target users

- **Community members** — join groups, follow places/causes, attend and volunteer at events.
- **Event organizers** — create and project-manage events, recruit volunteers, collect donations.
- **"Friends of" a place** — champions who adopt a structure/city/country and coordinate activity around it.
- **Donors / volunteers** — contribute money or time to events they care about.

---

## 3. Core concepts (glossary)

- **User** — a registered account (email or phone).
- **Group** — a space (public or private) where members post media, comment, and organize.
- **Media** — a photo or video attached to a group or event; ranked by engagement.
- **Event** — an organized activity with a plan, tasks, volunteers, and optional donation goal.
- **"Friend of" pledge** — a commitment by a user to support a specific **structure**, **city**, or **country**: gather/share info, volunteer, and help organize events. **[OPEN: define "structure" precisely — a building? a landmark? an organization/institution?]**
- **Engagement** — likes, comments, and views used to rank media.

---

## 4. Functional requirements (user stories + acceptance criteria)

### 4.1 Registration & accounts
- **US-1:** As a visitor, I can register using an email address **or** a phone number so that I can create an account.
  - Email registration requires email verification (confirmation link/code).
  - Phone registration requires phone verification (SMS code).
  - A password (or passwordless code) is set at registration. **[ASSUMPTION: email+password and phone+SMS code]**
  - Duplicate email/phone cannot register twice.
- **US-2:** As a user, I can log in and log out securely.
- **US-3:** As a user, I have a profile (name, avatar, bio). **[ASSUMPTION]**

### 4.2 Groups
- **US-4:** As a user, I can create a group and mark it **public** or **private**.
  - Public groups are discoverable and viewable by anyone.
  - Private groups require an invite/approval to join and are hidden from non-members. **[ASSUMPTION]**
- **US-5:** As a group member, I can add photos and videos to the group.
- **US-6:** As a group member, I can comment on media and posts in the group.
- **US-7:** As a group creator/admin, I can manage members (invite, approve, remove). **[ASSUMPTION]**

### 4.3 Media & engagement ranking
- **US-8:** As a user, I can like media and see like/comment/view counts.
- **US-9:** Media is ranked by an engagement score so the most-engaged content surfaces first.
  - **[OPEN: ranking formula — simple counts, or weighted (e.g. views + 3×comments + 2×likes with time decay)? For MVP I suggest a simple score; algorithm can evolve.]**

### 4.4 Events
- **US-10:** As a user, I can organize (create) an event with details (title, description, date/time, location, cover media).
- **US-11:** As an organizer, I can project-manage an event: create tasks, assign them, track status, set milestones. **[ASSUMPTION: Kanban/checklist-style task board]**
- **US-12:** As a user, I can pledge to **volunteer time** for an event (sign up for roles/shifts/tasks).
- **US-13:** As a user, I can **donate money** to an event. **[OPEN — see Section 7: real payments vs. tracked pledges for MVP]**
- **US-14:** As any user, I can view all **public** events (even without joining a group).
- **US-15:** As an organizer, I can see who volunteered and who donated.

### 4.5 "Friend of" (places & causes)
- **US-16:** As a user, I can pledge to be a **"Friend of"** a structure, city, or country.
- **US-17:** As a Friend, I can gather and share information about that place (posts, media, links).
- **US-18:** As a Friend, I can indicate availability to volunteer when needed.
- **US-19:** As a Friend, I can help organize events tied to that place.
- **US-20:** As a user, I can browse places and see their Friends, shared info, and upcoming events.
  - **[OPEN: where do the lists of structures/cities/countries come from — a predefined dataset, user-submitted, or a map/geolocation service?]**

### 4.6 Discovery & feed
- **US-21:** As a user, I have a feed of relevant content (groups I'm in, places I'm a Friend of, public events). **[ASSUMPTION]**
- **US-22:** As a user, I can search for groups, events, places, and people. **[ASSUMPTION]**

### 4.7 Moderation & safety **[OPEN — important for public media + money]**
- **US-23:** As a user, I can report inappropriate media, comments, or events.
- **US-24:** As an admin/moderator, I can review reports and remove content or users.
- *(Public photos/videos and donations typically require this before launch. Flagged as open for your decision on timing.)*

---

## 5. Non-functional requirements

- **Platform:** Web-first (responsive, works on mobile browsers). Native mobile apps are a later phase. **[ASSUMPTION — confirm web-first]**
- **Security/Privacy:** Secure auth, hashed passwords, private groups truly private, PII (email/phone) protected.
- **Scalability:** Start small/cheap; architecture should not block growth.
- **Compliance:** Privacy policy & terms needed. If real donations: payment regulations and possibly charity/tax rules apply. **[OPEN]**
- **Accessibility:** Aim for WCAG-friendly UI.
- **Cost:** Minimize monthly cost at launch (free tiers where possible).

---

## 6. Proposed MVP scope (smallest useful launch)

Goal: launch something real and cheap, prove the concept, then expand.

**In MVP:**
1. Register/login with email (phone can follow). **[ASSUMPTION: start email-only to cut SMS cost]**
2. User profiles.
3. Create public/private groups; join groups.
4. Post photos/videos to groups; comment; like.
5. Simple engagement count (likes/comments/views) with basic ranking.
6. Create and view events; public events visible to all.
7. Volunteer sign-up for events (time pledges).
8. Basic "Friend of" pledge to a city/country from a predefined list.
9. Report button + basic admin removal.

> **Note:** Donations (US-13) are DECIDED as deferred — not part of this build. No money handling in the MVP.

**Deferred to later phases:**
- Phone/SMS registration, real payment processing (Stripe), advanced ranking algorithm, full project-management suite, native mobile apps, "structure"-level places with maps/geo, recommendations feed.

---

## 7. Key open decisions (please confirm)

1. **Donations:** DECIDED — deferred entirely. No money handling and no donation feature in this build; to be implemented in a later phase.
2. **Engagement ranking:** Simple counts for MVP, weighted algorithm later? *(Draft assumes simple.)*
3. **Platform:** Web-first only for launch? *(Draft assumes yes.)*
4. **Registration:** Start **email-only** then add phone, or both from day one? *(Draft assumes email-first.)*
5. **"Structure":** What exactly is a structure (building, landmark, institution)?
6. **Places data:** Predefined list, user-submitted, or map/geo service for cities/countries/structures?
7. **Moderation:** Required at launch, or shortly after? *(Draft assumes a basic version at launch.)*

---

## 8. Recommended low-cost launch stack (preliminary)

> Detailed design comes after requirements are locked. This is a direction, not a commitment.

- **Frontend:** Next.js (React) — hosts free on Vercel/Cloudflare free tiers.
- **Backend/DB:** Supabase free tier (Postgres + Auth + file storage for media) — covers email/phone auth, database, and photo/video storage in one free service to start.
- **Hosting:** Vercel or Cloudflare Pages free tier, custom AidPal domain, free HTTPS.
- **Media:** Supabase Storage (free tier) now; move large video to Cloudflare R2/Stream if it grows.
- **Payments (when needed):** Stripe (pay-per-transaction, no monthly fee).
- **Estimated starting cost:** ~$0/month on free tiers + your domain renewal. Costs rise only as usage grows.

---

## 9. Next steps

1. You review this draft and answer Section 7.
2. I revise into **Requirements v1.0** (locked).
3. We produce a **Design** doc (data model, screens, architecture).
4. Break into an implementation **task plan** and build the MVP.
