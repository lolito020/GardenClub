'use client';

import { useState } from 'react';
import { X, Upload, File, Check, AlertCircle, Loader2 } from 'lucide-react';

interface APAFileUploadModalProps {
  reservationId: string;
  currentFile?: string;
  currentStatus?: 'PENDIENTE' | 'APROBADO' | 'NO_APLICA' | 'ENTREGADO';
  isAdmin?: boolean;
  onClose: () => void;
  onFileUploaded: (fileUrl: string, status?: string) => void;
  onStatusChange?: (status: 'PENDIENTE' | 'APROBADO' | 'ENTREGADO') => void;
}

export default function APAFileUploadModal({
  reservationId,
  currentFile,
  currentStatus = 'PENDIENTE',
  isAdmin = false,
  onClose,
  onFileUploaded,
  onStatusChange,
}: APAFileUploadModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [adminAction, setAdminAction] = useState<'approve' | null>(null);
  const [adminNotes, setAdminNotes] = useState('');

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const handleFileSelection = (file: File) => {
    // Validar tipo de archivo
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      alert('❌ Tipo de archivo no válido. Solo se permiten PDF, JPG, JPEG y PNG.');
      return;
    }

    // Validar tamaño (máximo 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('❌ El archivo es demasiado grande. Máximo 10MB permitido.');
      return;
    }

    setSelectedFile(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const uploadFile = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('reservationId', reservationId);

      // Simular progreso de subida
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev < 90) return prev + 10;
          return prev;
        });
      }, 200);

      const response = await fetch('/api/reservas/apa-upload', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.ok) {
        throw new Error('Error al subir el archivo');
      }

      const result = await response.json();
      
      // Actualizar estado a ENTREGADO automáticamente
      await updateReservationAPAStatus(reservationId, 'ENTREGADO', result.fileUrl);
      
      onFileUploaded(result.fileUrl, 'ENTREGADO');
      
      setTimeout(() => {
        onClose();
      }, 1000);

    } catch (error) {
      console.error('Error uploading file:', error);
      alert('❌ Error al subir el archivo. Intente nuevamente.');
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
    }
  };

  const updateReservationAPAStatus = async (id: string, status: string, fileUrl?: string, notes?: string) => {
    try {
      const response = await fetch(`/api/reservas/${id}/apa-status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apaEstado: status,
          apaComprobante: fileUrl,
          apaObservaciones: notes,
          apaFechaEntrega: status === 'ENTREGADO' ? new Date().toISOString() : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Error al actualizar estado APA');
      }
    } catch (error) {
      console.error('Error updating APA status:', error);
      throw error;
    }
  };

  const handleAdminAction = async () => {
    if (!adminAction) return;

    try {
      setIsUploading(true);
      
      // Si hay archivo seleccionado, subirlo primero
      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('reservationId', reservationId);

        const uploadResponse = await fetch('/api/reservas/apa-upload', {
          method: 'POST',
          body: formData,
        });

        if (!uploadResponse.ok) {
          throw new Error('Error al subir el archivo');
        }

        const uploadResult = await uploadResponse.json();
        
        // Ahora aprobar con el archivo subido
        await updateReservationAPAStatus(reservationId, 'APROBADO', uploadResult.fileUrl, adminNotes);
        onFileUploaded(uploadResult.fileUrl, 'APROBADO');
      } else {
        // Aprobar sin archivo (comprobante físico)
        await updateReservationAPAStatus(reservationId, 'APROBADO', currentFile, adminNotes);
        onFileUploaded(currentFile || '', 'APROBADO');
      }
      
      onStatusChange?.('APROBADO');
      onClose();
      
    } catch (error) {
      alert('❌ Error al procesar la aprobación. Intente nuevamente.');
    } finally {
      setIsUploading(false);
    }
  };

  const canUpload = currentStatus === 'PENDIENTE' || currentStatus === 'APROBADO' || currentStatus === 'ENTREGADO';
  const canAdminReview = isAdmin && (currentStatus === 'PENDIENTE' || currentStatus === 'ENTREGADO');

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-lg" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-slate-50 rounded-t-xl">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            Gestión APA
          </h3>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Estado actual */}
          <div className="bg-slate-50 rounded-lg p-3">
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Estado Actual del APA</h4>
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                currentStatus === 'APROBADO' ? 'bg-green-100 text-green-800' :
                currentStatus === 'ENTREGADO' ? 'bg-blue-100 text-blue-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {currentStatus === 'APROBADO' ? '✅ Aprobado' :
                 currentStatus === 'ENTREGADO' ? '📤 Entregado' :
                 '⏳ Pendiente'}
              </span>
              {currentFile && (
                <a 
                  href={currentFile} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
                >
                  <File className="w-4 h-4" />
                  Ver archivo digital
                </a>
              )}
            </div>
            {currentStatus === 'PENDIENTE' && (
              null
            )}
            {currentStatus === 'APROBADO' && !currentFile && (
              <div className="text-xs text-slate-600 bg-green-50 border border-green-200 rounded p-2">
                <span className="font-medium">✓ Aprobado:</span> Comprobante físico verificado en recepción.
              </div>
            )}
          </div>

          {/* Área de subida de archivos */}
          {canUpload && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-slate-700">Subir Comprobante APA</h4>
                <p className="text-xs text-slate-500 mt-1">
                  <span className="inline-flex items-center gap-1">
                    <span>📝</span>
                    Opcional: No es obligatorio adjuntar el comprobante de pago de APA
                  </span>
                </p>
              </div>
              
              {/* Zona de drag & drop */}
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  isDragging 
                    ? 'border-blue-400 bg-blue-50' 
                    : 'border-slate-300 hover:border-slate-400'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-600 mb-2">
                  Arrastra tu archivo aquí o 
                  <label className="text-blue-600 hover:text-blue-800 cursor-pointer ml-1">
                    selecciona uno
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleFileInputChange}
                    />
                  </label>
                </p>
                <p className="text-xs text-slate-500">
                  Formatos permitidos: PDF, JPG, PNG (máx. 10MB)
                </p>
              </div>

              {/* Archivo seleccionado */}
              {selectedFile && (
                <div className="bg-blue-50 rounded-lg p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <File className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-900">{selectedFile.name}</span>
                    <span className="text-xs text-blue-600">({(selectedFile.size / 1024 / 1024).toFixed(1)} MB)</span>
                  </div>
                  <button
                    onClick={() => setSelectedFile(null)}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Progreso de subida */}
              {isUploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Subiendo archivo...</span>
                    <span className="font-medium">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Panel de administrador - Gestión de APA */}
          {isAdmin && (currentStatus === 'PENDIENTE' || currentStatus === 'ENTREGADO') && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-slate-700">Gestión Administrativa</h4>
              
              {currentStatus === 'ENTREGADO' && currentFile ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">Archivo pendiente de revisión</p>
                      <p className="text-xs text-amber-700">El usuario ha subido un comprobante que requiere aprobación.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-800">Gestión administrativa</p>
                      <p className="text-xs text-blue-700">
                        {currentStatus === 'PENDIENTE' ? 
                          'Puede aprobar/rechazar si el comprobante de pago APA fue entregado físicamente.' :
                          'Revisar y decidir sobre el comprobante APA.'
                        }
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Acciones de administrador */}
              <div className="flex justify-center">
                <button
                  onClick={() => setAdminAction('approve')}
                  className={`flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-colors ${
                    adminAction === 'approve'
                      ? 'bg-green-600 text-white'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  {selectedFile ? 'Subir Archivo y Aprobar' : 'Aprobar APA'}
                </button>
              </div>

              {/* Notas del administrador */}
              {adminAction && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Observaciones (opcionales)
                  </label>
                  <textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Ej: Comprobante físico verificado en recepción..."
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-slate-50 rounded-b-xl flex justify-end gap-2">
          <button 
            onClick={onClose} 
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors"
          >
            Cancelar
          </button>
          
          {canUpload && selectedFile && (
            <button 
              onClick={uploadFile}
              disabled={isUploading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Subiendo...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Subir Archivo
                </>
              )}
            </button>
          )}

          {canAdminReview && adminAction && (
            <button 
              onClick={handleAdminAction}
              disabled={isUploading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Confirmar Aprobación
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}