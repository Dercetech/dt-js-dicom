/* global angular */


'use strict';

angular.module('dercetech.dicom').controller('DicomViewerController',

    ["$scope", "DicomWrapper", "DicomService",
        
    function($scope, DicomWrapper, DicomService){
        
	    var controller = this;

		////////////////////////////////////////////	    
	    // Expose functions and items //////////////

	    // Expose functions ////////////////////////
		///////////////////////////////////////////


		////////////////////////////////////////////	    
	    // Init logic //////////////////////////////

	    // Init logic //////////////////////////////
		///////////////////////////////////////////


		////////////////////////////////////////////	    
	    // Watches /////////////////////////////////

		// Source DICOM (DcmFile)
		$scope.$watch(watchSrc, onSrcChanged);
		function watchSrc(){ return controller.src}
		
	    // Watches /////////////////////////////////
		///////////////////////////////////////////

	    
		////////////////////////////////////////////	    
	    // Logic implementaiton ////////////////////
	    
	    // Watches /////////////////////////////////
	    
	    function onSrcChanged(newDcmFile){
	    	
	    	if(!newDcmFile){
	    		return;
	    	}
	    	
			// Have the painter draw this file
			controller.painter.set_file(newDcmFile);
			
			// Set plain CLUTs
			setPlainCLUTs();
			
			// Adjust windowing
			var windowing = DicomService.getWindowingUsingFile(newDcmFile);
			controller.painter.set_windowing(windowing.wl, windowing.ww);
			
			// Draw image
			controller.painter.draw_image();
	    }
	    
	    // Logic ///////////////////////////////////
	    
	    function drawDicom(dicomFile){

	    }

	    function setPlainCLUTs(){
	    	
            var ClutManager = DicomWrapper.ClutManager;
            setCLUTs(ClutManager.r('Plain'), ClutManager.g('Plain'), ClutManager.b('Plain'));
	    }
	    
	    function setCLUTs(r, g, b){
	    	
	    	// Set CLUTs
            controller.painter.set_cluts(r, g, b);
	    }
	    
	    // Logic implementaiton ////////////////////
		///////////////////////////////////////////
    }
]);