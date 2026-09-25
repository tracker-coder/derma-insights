# DermaSpa Clarity

Create the app shell for "DermaSpa Insights", an internal analytics dashboard for a medical spa.

Enable Lovable Cloud for auth and database.

Design: clean, calm, clinical-premium. Very light warm-grey background, white cards, one accent color

(deep teal), Inter font, generous spacing, rounded-xl cards with subtle borders, no gradients.

Works well on laptop and tablet; readable on phone.

Layout: left sidebar with "DermaSpa Insights" wordmark and nav:

Dashboard, Providers, Patients & Cohorts, Upload Data, Monthly Inputs, Data Health, Settings.

Top bar: space for global filters (date range, location, provider) + user menu with sign out.

Every page shows its title and an empty-state card explaining what will appear there.

Auth: email + password login page. No public sign-up. Create a profiles table

(id = auth user id, full_name, role 'admin' | 'viewer'). The first user created becomes admin.

Settings page has a "Users" section where admins invite users by email and set their role.

Unauthenticated visitors are redirected to /login.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://derma-insights.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9680a93c-5c67-42cb-86c6-31be6c547b22).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
