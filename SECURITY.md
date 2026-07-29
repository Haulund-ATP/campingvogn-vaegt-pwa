# Security Policy

## Rapportering

Hvis du finder en sikkerhedssårbarhed i dette repository, så opret venligst **ikke** et offentligt
issue. Kontakt i stedet repository-ejeren direkte via GitHub.

## Sikkerhedsmodel (kort)

- Public brugere logger aldrig ind med Microsoft — adgang sker via et pr.-trip public token i
  URL-fragmentet, udvekslet til en kortlivet, signeret, `HttpOnly`/`Secure`/`SameSite=Strict`-cookie.
- Administrator bruger ét globalt token efter samme mønster, med strengere rate limiting og kortere
  session-levetid.
- Alle tokens gemmes udelukkende som HMAC-SHA-256-hash i SharePoint — aldrig i klartekst.
- Browseren modtager aldrig Graph-tokens, client secrets eller SharePoint-legitimationsoplysninger.
- Runtime-appregistreringen bruger `Sites.Selected` (application permission) begrænset til det ene
  konkrete SharePoint-site — aldrig `Sites.ReadWrite.All`.
- Alle muterende endpoints kræver CSRF-beskyttelse via double-submit cookie.
- Rate limiting er bounded in-memory pr. Function-instans (ikke en absolut distribueret garanti i
  serverless drift — se [docs/security.md](docs/security.md)).

## Ansvarlig offentliggørelse

Dette er et lille privat hobbyprojekt uden SLA, men reelle sårbarhedsrapporter tages alvorligt og
rettes hurtigst muligt.
