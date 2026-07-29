export function Landing({ reason }: { reason?: string }) {
  return (
    <div className="screen">
      <h1>Campingvogn Vægt</h1>
      {reason && <p className="field-error">{reason}</p>}
      <p>Scan en QR-kode for at fortsætte</p>
      <p className="muted">
        Brug en trip-QR-kode til:
        <br />• Tilføj vægt
        <br />• Fjern vægt
      </p>
      <p className="muted">
        Brug administrator-QR-koden til:
        <br />• Opret og administrér trips
      </p>
    </div>
  );
}
