'use client';

export default function HomePage() {
  // El middleware se encarga de toda la lógica de redirección
  // Este componente solo se muestra brevemente antes de la redirección
  return (
    <div className="min-h-screen grid place-items-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto mb-4"></div>
        <p>Iniciando Garden Club Paraguayo...</p>
      </div>
    </div>
  );
}