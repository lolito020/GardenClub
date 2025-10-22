# Script para corregir el manejo de errores de reservas
$filePath = "C:\Garden\app\admin\socios\page.tsx"
$content = Get-Content $filePath

# Buscar y reemplazar las líneas problemáticas
for ($i = 0; $i -lt $content.Length; $i++) {
    if ($content[$i] -match "console\.warn\(`No se pudo crear la reserva para.*await reservaRes\.text\(\)") {
        # Reemplazar la línea actual y las siguientes
        $content[$i] = "              const errorResponse = await reservaRes.text();"
        
        # Insertar las nuevas líneas
        $newLines = @(
            "              let errorMsg = errorResponse;",
            "              try {",
            "                const errorJson = JSON.parse(errorResponse);",
            "                errorMsg = errorJson.msg || errorResponse;",
            "              } catch (e) {",
            "                // Si no es JSON válido, usar el texto tal como está",
            "              }",
            "              console.warn(`No se pudo crear la reserva para `${c.concepto}`:`, errorMsg);",
            "              alert(`❌ No se pudo crear la reserva para `${c.concepto}`:\n\n`${errorMsg}`);",
            "              return; // Detener el proceso"
        )
        
        # Insertar las nuevas líneas después de la línea actual
        $content = $content[0..$i] + $newLines + $content[($i+1)..($content.Length-1)]
        $i += $newLines.Length # Saltar las líneas que acabamos de insertar
    }
}

# Guardar el archivo modificado
$content | Set-Content $filePath -Encoding UTF8

Write-Host "Archivo modificado exitosamente"