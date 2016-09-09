/* global angular */
/* global $ */

'use strict';

angular.module('dercetech.dicom').directive('dicomViewer',

    ["DicomWrapper",

    function(DicomWrapper) {
  
        return {

            controller      : 'DicomViewerController',
            controllerAs    : 'DicomViewerCtrl',

            scope: true,
            bindToController    : {

                'src'       : '=?',       // optional binding, otherwise it's an unauthorized assignment
                'onScroll'  : '&'
            },
            
            replace     : true,
            transclude  : true,
            template    : '<div class="dicom-viewer"><canvas></canvas><div class="overlay" ng-transclude></div></div>',
            
            link: function (scope, element, attributes, controller) {
                
                // DOM elements
                var container = element[0];
                var canvas = angular.element('canvas', element)[0];

                // 1. Handle resize
                canvasResize(true);
                
                // Set canvas dimensions (don't rely on CSS as it doesn't affect the canvas' internals)
                function canvasResize(initializing){
                    canvas.width = container.clientWidth - 1;
                    canvas.height = container.clientHeight - 1;
                    if(!initializing){
                        controller.painter.onresize();
                    }
                }
                
                $(window).resize(function(evt){
                    scope.$apply(function(aScope){
                        canvasResize(false);
                    });
                });


                // 2. Register touch/scroll events
                element.bind('mousewheel', handleScroll);
                var scroll = 0;
                
                function handleScroll(event){
                    
                    var direction;
                    scroll -= event.originalEvent.deltaX;
                    scroll += event.originalEvent.deltaY;
                    
                    // Adding up to 20 prevents over-sensitive touchpads to slide through the entire stack in a few mm
                    if(Math.abs(scroll) > 20){
                        scope.$apply(function(){
                            controller.onScroll()(scroll > 0 ? 1 : -1);
                            scroll = 0;
                        });
                    }
                    
                    if (event.preventDefault) event.preventDefault();
                    event.returnValue = false;
                }

                // 3. Init drawing component

                try{
                    
                    // Create GLPainter
                    controller.painter = new DicomWrapper.GLPainter(null, canvas);
                    
                    // Create Canvas painter (gives a black screen with local files)
                    // controller.painter = new DicomWrapper.CanvasPainter(null, canvas);
                    
                    // Set display of CLUT bar
                    //controller.painter.clut_bar_enabled = true;
                    
                    // Init painter (no need to preserve drawing buffer)
                    controller.painter.init(null, true);
                }
                
                catch(e){
                    console.log('DicomViewer: error creating painter');
                }
            }
        };
    }
]);