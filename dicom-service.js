/* global angular */

'use strict';

angular.module('dercetech.dicom').factory('DicomService',

    ["FileService", "DicomWrapper",

    function(FileService, DicomWrapper) {

        ////////////////////////////////////////
        // Interface ///////////////////////////
        
        return {
            
            // Check if file / byte array contains DICOM data
            "isDicomFile"           : isDicomFile,              // Promise
            "isByteArrayADicomFile" : isByteArrayADicomFile,    // Synchronous
            
            // Obtain a DICOM wrapper of the given byte array
            "parseDicomData"    : parseDicomData,
            
            // Convert DICOM to png (early implementation, might suck)
            "getPngFromDcmFile" : getPngFromDcmFile,
            
            // Obtain windowing data based on DICOM file (parsed byte array)
            "getWindowingUsingFile" : getWindowingUsingFile
        }
        
        // Interface ///////////////////////////
        ///////////////////////////////////////


        ////////////////////////////////////////
        // Service implementation //////////////

        function isDicomFile(aFile){
            
            // Return the promise enriched with a DICOM-parsing .then routine
            return FileService.readFileAsByteArray(aFile).then(function(fileAsByteArray){
                
                return isByteArrayADicomFile(fileAsByteArray);
            });
        }
        
        function isByteArrayADicomFile(byteArray){
            
            // DICOM spec ps3.10 section 7.1: The header is always encoded in Explicit VR Little Endian
            // -> It is safe to read bytes in that position&length "from left to right" (aka little endian)
            try{
                
                // Seek to offset 128 and read 4 bytes
                var prefix = FileService.readFixedString(byteArray, 128, 4);
                
                // Well-formed P10 files have the "DICM" header in that position
                return (prefix === "DICM");
            }
            
            catch(e){
                return false;
            }
        }

        function parseDicomData(dicomByteArray){
            
            // jsdicom: DicomParser
            var parser = new DicomWrapper.DicomParser(dicomByteArray);
            
            // jsdicom: DicomFile
            var dicomFile = parser.parse_file();
            
            if(!dicomFile) return;
            
            applyDicomModality(dicomFile);
            
            return dicomFile;
        }


        function applyDicomModality(aDicomFile){
            
            if (aDicomFile.Modality == "CT" || aDicomFile.Modality == "PT" || aDicomFile.Modality == "MR") {
                var imageOrientation = aDicomFile.ImageOrientationPatient;
                aDicomFile.imageOrientationRow = imageOrientation.slice(0,3);
                aDicomFile.imageOrientationColumn = imageOrientation.slice(3,6);
            }
            
            else if(aDicomFile.modality == "US") {
                aDicomFile.RescaleIntercept = 0;
                aDicomFile.RescaleSlope = 1;
            }
            
            else {
                aDicomFile.RescaleIntercept = 0;
                aDicomFile.RescaleSlope = 1;
            }
        }
        
        
        function getPngFromDcmFile(dcmFile, cluts, using2DCanvas){
            
        	// Hi, I'm Jem! This code isn't awesome but it does the job.
        	// Seems linked to a security feature
        	
        	// DICOM data
        	var width = 480; dcmFile.Rows;
        	var height = 480; dcmFile.Columns;
        	var pixels = dcmFile.PixelData;
        	
        	// 1. Create a canvas (but don't attach to the DOM)
        	var canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            
            // Use web gl rendering
            if(!using2DCanvas){

                // Create GLPainter
                var painter = new DicomWrapper.GLPainter(null, canvas);
                
                // Init painter (preserve drawing buffer, otherwise it wont be possible to export rendered image)
                painter.init(null, true);
                
    			// Have the painter draw this file
    			painter.set_file(dcmFile);
    			
    			// Set plain CLUTs
    			var ClutManager = DicomWrapper.ClutManager;
                painter.set_cluts(ClutManager.r('Plain'), ClutManager.g('Plain'), ClutManager.b('Plain'));
    			
    			// Adjust windowing
    			var windowing = getWindowingUsingFile(dcmFile);
    			painter.set_windowing(windowing.wl, windowing.ww);
    			
    			// Draw image
    			painter.draw_image();
    			
            	// Obtain dataURL
            	var dataURL = canvas.toDataURL();
            	
            	return dataURL;
            }
            
            // Option: Using 2D canvas (rendering glitches)
            else{
            
            	// 1.1 Get canvas image data
            	var ctx = canvas.getContext("2d");
            	var imgData = ctx.getImageData(0,0,width,height);
            	
            	// 2. Compute DICOM bytes per pixel
            	var bpp = pixels / width / height;
            	
            	// 3. Write DICOM pixel data to RGBA imageData
            	for(var row = 0; row < width; row++) {
            		for(var col = 0; col < height; col++) {
            		
            			var dataIndex = (col + row*height);
            			var intensity = dcmFile.PixelData[dataIndex];
            			
            			// 3.1 Adjust intensity based on rescaled slope & intercept
            			// intensity = intensity * dcmFile.RescaleSlope + dcmFile.RescaleIntercept;
            			
            			// 3.2 Adjust Windowing (contrast & lightness)
            			var lowerBound = this.wl - this.ww/2.0;
                        var upperBound = this.wl + this.ww/2.0;
            			//intensity = (intensity - lowerBound) / (upperBound - lowerBound);
            			
            			// 3.3 Crop saturation
            			//if(intensity < 0.0) intensity = 0.0;
            			//if(intensity > 1.0) intensity = 1.0;
            			//intensity *= 255.0;
            			
            			// 3.4 Round intensity
            			intensity = Math.round(intensity);
            			
            			// 3.5 Set canvas pixel intensity (color lookup table is optional)
            			var canvasIndex = (col + row * height) * 4 /* bytes per RGBA pixel */;
            			
            			if(!cluts){
            			    
                			imgData.data[canvasIndex]     = intensity;
                			imgData.data[canvasIndex + 1] = intensity;
                			imgData.data[canvasIndex + 2] = intensity;
                			imgData.data[canvasIndex + 3] = 0xFF;       // 255 = opaque
            			}
            			
            			else{
            			    
                			imgData.data[canvasIndex]     = cluts[0][intensity];
                			imgData.data[canvasIndex + 1] = cluts[1][intensity];
                			imgData.data[canvasIndex + 2] = cluts[2][intensity];
                			imgData.data[canvasIndex + 3] = 0xFF;       // 255 = opaque
            			}
            		}
            	}
            	
            	// 4. Put data back onto the 2D canvas
            	ctx.putImageData(imgData, 0, 0);
            	console.log('unhandled exception to try/catch');
            	
            	// 5. Obtain dataURL
            	var dataURL = canvas.toDataURL();
            	
            	return dataURL;
            }
        }
        
        function getWindowingUsingFile(dicomFile){
	    	
		    var wl, ww;
		    
		    if(dicomFile.WindowCenter !== undefined) {
		        
		        wl = dicomFile.WindowCenter;
		        ww = dicomFile.WindowWidth;
		        
		        if(wl.constructor == Array) {
		            wl = wl[0];
		        }
		        
		        if(ww.constructor == Array) {
		            ww = ww[0];
		        }
		    }
		    
		    // Experimental, to test!
		    else if(dicomFile.RescaleSlope !== undefined) {
		    	
		        // TODO check the actual datatype instead of using 65536...
		        var maxval = this.files[0].RescaleSlope * 65536 + this.files[0].RescaleIntercept;
		        var minval = this.files[0].RescaleIntercept;
		        
		        ww = maxval-minval;
		        wl = (maxval+minval)/2;
		    }
		    
		    // Experimental, to test!
		    else {
		    	
		        // Min-max VOI
		        var windowing = min_max_voi(this.files[0]);
		        
		        wl = windowing[0];
		        ww = windowing[1];
		        
		        if(this.files[0].PixelRepresentation == 0x01) {
		            wl -= (0x01 << this.files[0].HighBit);
		        }
		    }
		    
		    return {
		        wl: wl,
		        ww: ww
		    };
	    }
	    
	    function min_max_voi(file) {
			var min = Math.min.apply(this, file.PixelData);
			var max = Math.max.apply(this, file.PixelData);
			var center = min + (max-min)/2;
			var level = max-min;
			return [center, level];
		}
        
/*
        function isASCIIString(str) {
            return /^[\x00-\x7F]*$/.test(str);
        }
*/

        // Service implementation //////////////
        ///////////////////////////////////////
    }
]);