/**
 * File type utilities
 *
 * Functions for determining file types and icons based on extensions.
 */

import type { PDMFile, FileIconType } from '@/types/pdm'

/**
 * Map file extension to PDM file type for database categorization
 */
export function getFileType(extension: string): PDMFile['file_type'] {
  // Normalize extension to have leading dot
  const ext = extension.startsWith('.') ? extension.toLowerCase() : ('.' + extension.toLowerCase())

  // CAD Parts
  if ([
    '.sldprt', '.prtdot', '.sldlfp', '.sldftp', '.sldprt~',    // SolidWorks
    '.ipt',                                                      // Inventor
    '.prt',                                                      // Creo/NX
    '.par', '.psm', '.pwd',                                      // Solid Edge
    '.catpart', '.catshape',                                     // CATIA
    '.3dm',                                                      // Rhino
    '.skp', '.skb',                                              // SketchUp
    '.fcstd', '.scad', '.brep',                                  // Open source
    '.blend', '.blend1', '.max', '.ma', '.mb', '.c4d',           // 3D viz
    '.hda', '.hip', '.hipnc',                                    // Houdini
    '.x_t', '.x_b', '.xmt_txt', '.xmt_bin',                      // Parasolid
    '.sat', '.sab', '.asat',                                     // ACIS
    '.f3d', '.f3z',                                              // Fusion 360
  ].includes(ext)) {
    return 'part'
  }

  // CAD Assemblies
  if ([
    '.sldasm', '.asmdot', '.sldasm~',                            // SolidWorks
    '.iam', '.ipn',                                              // Inventor
    '.asm',                                                       // Creo
    '.catproduct',                                                // CATIA
  ].includes(ext)) {
    return 'assembly'
  }

  // CAD Drawings
  if ([
    '.slddrw', '.slddrt', '.drwdot', '.slddrw~', '.sldstd',      // SolidWorks
    '.idw', '.dwg', '.dwt', '.dws', '.dwf', '.dwfx',             // Inventor/AutoCAD
    '.dxf',                                                       // DXF
    '.drw', '.frm',                                               // Creo
    '.dft',                                                       // Solid Edge
    '.catdrawing',                                                // CATIA
    '.layout',                                                    // SketchUp
  ].includes(ext)) {
    return 'drawing'
  }

  // PDF
  if (ext === '.pdf') {
    return 'pdf'
  }

  // STEP and neutral exchange formats
  if ([
    '.step', '.stp', '.stpz', '.p21',                            // STEP
    '.iges', '.igs',                                              // IGES
    '.jt',                                                        // JT
    '.vda', '.vdafs',                                             // VDA-FS
    '.3dxml', '.cgr',                                             // CATIA exchange
    '.stl', '.stla', '.stlb',                                     // STL
    '.3mf', '.amf',                                               // Additive manufacturing
    '.obj', '.mtl',                                               // OBJ
    '.fbx', '.dae',                                               // Animation exchange
    '.gltf', '.glb',                                              // GL Transmission
    '.usdz', '.usda', '.usdc',                                    // USD
    '.ply', '.wrl', '.vrml', '.x3d',                              // Other mesh
    '.off', '.smesh',                                             // Mesh formats
  ].includes(ext)) {
    return 'step'
  }

  return 'other'
}

/**
 * Map file extension to icon type for UI display (more granular than file_type)
 */
export function getFileIconType(extension: string): FileIconType {
  // Normalize extension to have leading dot
  const ext = extension.startsWith('.') ? extension.toLowerCase() : ('.' + extension.toLowerCase())

  // CAD Parts (all CAD software)
  if ([
    '.sldprt', '.prtdot', '.sldlfp', '.sldftp', '.sldprt~', '.sldblk', // SolidWorks
    '.ipt',                                                            // Inventor
    '.prt',                                                            // Creo/NX
    '.par', '.psm', '.pwd',                                            // Solid Edge
    '.catpart', '.catshape', '.catmaterial',                           // CATIA
    '.3dm', '.gh', '.ghx',                                             // Rhino/Grasshopper
    '.skp', '.skb',                                                    // SketchUp
    '.fcstd', '.scad', '.brep',                                        // Open source
    '.blend', '.blend1', '.max', '.ma', '.mb', '.c4d',                 // 3D visualization
    '.hda', '.hip', '.hipnc',                                          // Houdini
    '.x_t', '.x_b', '.xmt_txt', '.xmt_bin',                            // Parasolid
    '.sat', '.sab', '.asat',                                           // ACIS
    '.f3d', '.f3z', '.wire',                                           // Fusion 360/Alias
    '.eprt',                                                           // eDrawings part
  ].includes(ext)) {
    return 'part'
  }

  // CAD Assemblies
  if ([
    '.sldasm', '.asmdot', '.sldasm~',                                  // SolidWorks
    '.iam', '.ipn', '.ipj',                                            // Inventor
    '.asm',                                                             // Creo
    '.catproduct',                                                      // CATIA
    '.easm',                                                            // eDrawings assembly
  ].includes(ext)) {
    return 'assembly'
  }

  // CAD Drawings
  if ([
    '.slddrw', '.slddrt', '.drwdot', '.slddrw~', '.sldstd',            // SolidWorks
    '.idw', '.dwg', '.dwt', '.dws', '.dwf', '.dwfx',                   // Inventor/AutoCAD
    '.dxf',                                                             // DXF
    '.drw', '.frm', '.sec', '.lay', '.neu',                            // Creo
    '.dft',                                                             // Solid Edge
    '.catdrawing',                                                      // CATIA
    '.layout',                                                          // SketchUp
    '.edrw',                                                            // eDrawings drawing
  ].includes(ext)) {
    return 'drawing'
  }

  // STEP/Exchange/Mesh formats
  if ([
    '.step', '.stp', '.stpz', '.p21',                                  // STEP
    '.iges', '.igs',                                                    // IGES
    '.jt',                                                              // JT
    '.vda', '.vdafs',                                                   // VDA-FS
    '.3dxml', '.cgr',                                                   // CATIA exchange
    '.stl', '.stla', '.stlb',                                          // STL
    '.3mf', '.amf',                                                     // Additive manufacturing
    '.obj', '.mtl',                                                     // OBJ
    '.fbx', '.dae',                                                     // Animation exchange
    '.gltf', '.glb',                                                    // GL Transmission
    '.usdz', '.usda', '.usdc',                                          // USD
    '.ply', '.wrl', '.vrml', '.x3d',                                   // Other mesh
    '.off', '.smesh',                                                   // Mesh formats
  ].includes(ext)) {
    return 'step'
  }

  // PDF
  if (ext === '.pdf') {
    return 'pdf'
  }

  // Images (raster and vector)
  if ([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp',                  // Raster
    '.tiff', '.tif', '.ico', '.icns',                                  // Raster
    '.svg', '.ai', '.eps', '.psd', '.xcf',                             // Vector/editing
    '.raw', '.cr2', '.nef', '.arw', '.dng', '.heic',                   // RAW
  ].includes(ext)) {
    return 'image'
  }

  // Spreadsheets
  if (['.xlsx', '.xls', '.xlsm', '.csv', '.ods'].includes(ext)) {
    return 'spreadsheet'
  }

  // Presentations
  if (['.ppt', '.pptx', '.odp'].includes(ext)) {
    return 'presentation'
  }

  // Archives
  if (['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.zst', '.tgz', '.tbz2'].includes(ext)) {
    return 'archive'
  }

  // Schematics (red chip)
  if ([
    '.sch',                                                             // Eagle/generic
    '.kicad_sch',                                                       // KiCad
    '.schdoc', '.prjsch',                                               // Altium
    '.dsn',                                                             // OrCAD
  ].includes(ext)) {
    return 'schematic'
  }

  // Libraries (purple chip)
  if ([
    '.lbr',                                                             // Eagle
    '.kicad_mod', '.kicad_sym',                                        // KiCad
    '.schlib', '.pcblib', '.intlib',                                   // Altium
    '.spm',                                                             // Allegro symbol
    '.fp-lib-table', '.sym-lib-table',                                 // KiCad tables
  ].includes(ext)) {
    return 'library'
  }

  // PCB/Electronics (green chip for boards/gerbers)
  if ([
    '.kicad_pcb', '.kicad_pro', '.kicad_wks', '.kicad_dru',            // KiCad
    '.brd', '.pcb',                                                     // Eagle/Allegro
    '.pcbdoc', '.prjpcb',                                               // Altium
    '.dra',                                                             // Allegro drawing
    '.gbr', '.ger', '.pho',                                             // Gerber
    '.gtl', '.gbl', '.gts', '.gbs', '.gto', '.gbo',                    // Gerber layers
    '.gtp', '.gbp', '.gko', '.gm1', '.gm2', '.gd1',                    // Gerber layers
    '.drl', '.xln', '.exc',                                             // Drill files
  ].includes(ext)) {
    return 'pcb'
  }

  // Firmware
  if (['.hex', '.bin', '.elf', '.uf2', '.dfu'].includes(ext)) {
    return 'firmware'
  }

  // G-code / CNC / CAM
  if ([
    '.nc', '.gcode', '.ngc', '.tap', '.cnc', '.ncc',                   // G-code
    '.iso', '.mpf', '.spf',                                             // CNC programs
    '.mastercam', '.mcam', '.emcam', '.hsm',                           // CAM software
  ].includes(ext)) {
    return 'gcode'
  }

  // Simulation / FEA / CAE
  if ([
    '.sldcmp', '.smg', '.sldpfl',                                      // SolidWorks simulation
    '.cdb', '.db', '.inp', '.odb',                                     // ANSYS/Abaqus
    '.cas', '.dat', '.msh',                                             // Fluent/mesh
    '.nas', '.bdf', '.fem', '.op2',                                    // Nastran
    '.smc',                                                             // Multi-body
  ].includes(ext)) {
    return 'simulation'
  }

  // Video
  if (['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.webm', '.m4v', '.flv'].includes(ext)) {
    return 'video'
  }

  // Code
  if ([
    '.py', '.js', '.ts', '.c', '.cpp', '.h', '.hpp', '.cs', '.java',   // Languages
    '.rs', '.go', '.swift', '.kt', '.m', '.mlx', '.mat',               // Languages
    '.json', '.xml', '.yaml', '.yml', '.toml',                         // Data formats
    '.html', '.css', '.scss', '.less', '.sql',                         // Web/DB
    '.sh', '.bash', '.ps1', '.bat', '.cmd',                            // Scripts
    '.ini', '.cfg', '.conf', '.properties',                            // Config
  ].includes(ext)) {
    return 'code'
  }

  // Text/Documents
  if (['.txt', '.md', '.rst', '.doc', '.docx', '.rtf', '.odt'].includes(ext)) {
    return 'text'
  }

  return 'other'
}

/**
 * Check if a file is a CAD file based on extension
 */
export function isCADFile(filename: string): boolean {
  const ext = '.' + filename.split('.').pop()?.toLowerCase()
  // Import the CAD_EXTENSIONS constant from pdm types
  const cadExtensions = [
    '.sldprt', '.sldasm', '.slddrw',  // SolidWorks
    '.step', '.stp', '.iges', '.igs',  // Neutral formats
    '.dxf', '.dwg',                    // AutoCAD
    '.stl', '.obj', '.fbx',            // Mesh formats
    '.catpart', '.catproduct',         // CATIA
    '.prt', '.asm', '.drw',            // Pro/E, Creo
    '.ipt', '.iam', '.idw',            // Inventor
    '.f3d',                            // Fusion 360
    '.fcstd',                          // FreeCAD
    '.3dm',                            // Rhino
    '.skp',                            // SketchUp
    '.par', '.psm', '.dft',            // Solid Edge
    '.blend',                          // Blender
    '.gltf', '.glb',                   // GL Transmission
    '.3mf',                            // 3D Manufacturing Format
  ]
  return cadExtensions.includes(ext)
}
