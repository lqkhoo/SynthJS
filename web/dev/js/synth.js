/**
 * @author Li Quan Khoo
 */
var SYNTH = (function($, _, Backbone, Timbre, MUSIC, MUSIC_Note, MUSIC_Interval) {
    "use strict";
    // Require --------------------------------------------------------------------------------------
    if(! $) { throw 'jQuery not available.'; }
    if(! _) { throw 'Underscore.js not available'; }
    if(! Backbone) { throw 'Backbone.js not available.'; }
    if(! Timbre) { throw 'Timbre.js not available.'; }
    if(! MUSIC || ! MUSIC_Note || ! MUSIC_Interval) { throw 'MUSIC.js not available. '; }
    
    // Establish | Template cache -------------------------------------------------------------------
    SYNTH.templateCache = {};
    
    // Declare | Template cacher function ------------------------------------------------------------
    function cacheTemplates(cacheObject, templateUrl, templateSelector) {
        if(! cacheObject) {
            cacheObject = {};
        }
        
        var templateString;
        $.ajax({
            url: templateUrl,
            method: 'GET',
            async: false,
            success: function(data) {
                templateString = $(data).filter(templateSelector);
                var i;
                for(i = 0; i < templateString.length; i++) {
                    cacheObject[templateString[i].id] = $(templateString[i]).html();
                }
            },
            error: function() {
                throw 'Error fetching templates';
            }
        });
    }
    
    // Op | Cache templates
    cacheTemplates(SYNTH.templateCache, 'templates/templates.html', '.template');
    
    // Declare | Frequency table generator function
    function generateFrequencyTable() {
        var tones = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
        var octaves = ['1', '2', '3', '4', '5', '6', '7', '8'];
        
        SYNTH.TONES = ['A0', 'Bb0', 'B0'];
        (function() {
            var i, j;
            for(i = 0; i < octaves.length; i++) {
                for(j = 0; j < tones.length; j++) {
                    SYNTH.TONES.push(tones[j] + octaves[i]);
                    if(SYNTH.TONES.length >= 88) {
                        return;
                    }
                }
            }
        }());
        
        SYNTH.FREQS = [];
        (function() {
            var i;
            for(i = 0; i < SYNTH.TONES.length; i++) {
                SYNTH.FREQS.push(MUSIC_Note.fromLatin(SYNTH.TONES[i]).frequency());
            }
        }());
    };
    
    // Op | Generate frequency table
    generateFrequencyTable();
    
    // Op | Augment Music.js library scale definition with chromatic scale
    MUSIC.scales['chromatic'] = MUSIC.scales['chromatic'] || ['minor second', 'major second', 'minor third', 'major third', 'fourth', 'augmented fourth', 'fifth', 'minor sixth', 'major sixth', 'minor seventh', 'major seventh'];
    
    // Declare | Sound definitions ----------------------------------------------------------------------------
    function makeTimbre(soundCode, frequencyArray, loudness, attack, decay, sustain, release) {
        
        switch(soundCode) {
        case 'synthPiano':
            var i;
            var oscArray = [];
            
            for(i = 0; i < frequencyArray.length; i++) {
                oscArray.push(Timbre('sin', {freq: frequencyArray[i], mul: loudness}));
            }
            var env = Timbre('perc', {r: release}, oscArray).bang();
            return env;
            
        default:
            // do nothing
            return;
        }
    }
    
    // Declare | Command class ----------------------------------------------------------------------
    
    /*
     * Specify a command this way:
     * var cmd = new Command({
     *     scope: this,
     *     exec: {
     *         func: myFunction,
     *         args: [myArg1, myArg2,...]
     *     },
     *     undo: {
     *         func: myUndoFunction,
     *         args: [myArg1, myArg2...]
     *     }
     * });
     */
    function Command(args) {
        var self = this;
        this._scope = args.scope;
        this._func = args.exec.func;
        this._args = args.exec.args;
        this._undoFunc = args.undo.func;
        this._undoArgs = args.undo.args;
        this.exec = function() {
            self._func.apply(self._scope, self._args);
        };
        this.undo = function() {
            self._undoFunc.apply(self._scope, self._undoArgs);
        };
    };
    
    var Invoker = Backbone.Model.extend({
        defaults: {            
            'undoStack': [],
            'redoStack': []
        },
        _getUndoStack: function() {
            var undoStack = this.get('undoStack');
            return undoStack;
        },
        
        _getRedoStack: function() {
            var redoStack = this.get('redoStack');
            return redoStack;
        },
        getUndoStackLength: function() {
            return this._getUndoStack().length;
        },
        getRedoStackLength: function() {
            return this._getRedoStack().length;
        },
        invoke: function(command) {
            this._getUndoStack().push(command);
            command.exec();
            this.set('redoStack', []);
            this.trigger('change:undoStack');
            this.trigger('change:redoStack');
        },
        undo: function() {
            var command = this._getUndoStack().pop();
            command.undo();
            this._getRedoStack().push(command);
            this.trigger('change:undoStack');
            this.trigger('change:redoStack');
        },
        redo: function() {
            var command = this._getRedoStack().pop();
            command.exec();
            this._getUndoStack().push(command);
            this.trigger('change:undoStack');
            this.trigger('change:redoStack');
        }
    });
     
    // Declare | Models ---------------------------------------------------------------------------------------
    
    /**
     * A note. The id is when it's played
     * If ornaments are to be added later, it should be here
     */
    var Note = Backbone.Model.extend({
        defaults: {
            'id': null,
            'value': 1,
            'beat': null
        },
        
        // setters | getters
        getTime: function() {
            var id = this.get('id');
            return id;
        },
        setTime: function(newId) {
            this.set('id', newId);
            return newId;
        },
        getValue: function() {
            var value = this.get('value');
            return value;
        },
        setValue: function(newValue) {
            this.set('value', newValue);
            return newValue;
        },
        getBeat: function() {
            var beat = this.get('beat');
            return beat;
        },
        setBeat: function(beat) {
            this.set('beat', beat);
            return beat;
        } 
    });
    
    /** Collection of notes */
    var Notes = Backbone.Collection.extend({
        model: Note
    });
    
    /**
     * 
     */
    var Pitch = Backbone.Model.extend({
        defaults: {
            'id': null,
            'isPlayableArray': null,
            'noteCollection': null,
            'name': null,
            'octave': null,
            'isPlayed': true,
            'isSelected': false
        },
        
        // setters | getters
        getId: function() {
            var id = this.get('id');
            return id;
        },
        setId: function(newId) {
            this.set('id', newId);
            return newId;
        },
        getIsPlayableArray: function() {
            var array = this.get('isPlayableArray');
            return array;
        },
        setIsPlayableArray: function(array) {
            this.set('isPlayableArray', array);
            return array;
        },
        getNoteCollection: function() {
            var noteCollection = this.get('noteCollection');
            return noteCollection;
        },
        setNoteCollection: function(noteCollection) {
            this.set('noteCollection', noteCollection);
            return noteCollection;
        },
        getNotes: function() {
            var notes = this.getNoteCollection().models;
            return notes;
        },
        getOctave: function() {
            var octave = this.get('octave');
            return octave;
        },
        getIsPlayed: function() {
            var isPlayed = this.get('isPlayed');
            return isPlayed;
        },
        setIsPlayed: function(isPlayed) {
            this.set('isPlayed', isPlayed);
            return isPlayed;
        },
        getIsSelected: function() {
            var isSelected = this.get('isSelected');
            return isSelected;
        },
        setIsSelected: function(isSelected) {
            this.set('isSelected', isSelected);
            return isSelected;
        },
        
        // methods
        //TODO
        setMaskValue: function(from, to, value) {
        }

    });
    
    var Pitches = Backbone.Collection.extend({
        model: Pitch
    });
    
    var SoundGenerator = Backbone.Model.extend({
        
    });
    
    /**
     * An instrument
     */
    var Instrument = Backbone.Model.extend({
        defaults: {
            'id': null,
            'name': '(unnamed)',
            'orchestra': null,
            'pitchCollection': null,
            'soundGenerator': null,
            'volume': 1,
            'isMuted': false,
            'isSelected': false
        },
        
        getId: function() {
            var id = this.get('id');
            return id;
        },
        setId: function(newId) {
            this.set('id', newId);
            return newId;
        },
        getName: function() {
            var name = this.get('name');
            return name;
        },
        setName: function(newName) {
            this.set('name', newName);
            return newName;
        },
        getOrchestra: function() {
            var orchestra = this.get('orchestra');
            return orchestra;
        },
        setOrchestra: function(newOrchestra) {
            this.set('orchestra', newOrchestra);
            return newOrchestra;
        },
        getPitchCollection: function() {
            var pitchCollection = this.get('pitchCollection');
            return pitchCollection;
        },
        setPitchCollection: function(pitchCollection) {
            this.set('pitchCollection', pitchCollection);
            return pitchCollection;
        },
        getSoundGenerator: function() {
            var soundGenerator = this.get('soundGenerator');
            return soundGenerator;
        },
        setSoundGenerator: function(newSoundGenerator) {
            this.set('soundGenerator', newSoundGenerator);
            return newSoundGenerator;
        },
        getVolume: function() {
            var volume = this.get('volume');
            return volume;
        },
        setVolume: function(newVolume) {
            this.set('volume', newVolume);
            return newVolume;
        },
        getIsMuted: function() {
            var isMuted = this.get('isMuted');
            return isMuted;
        },
        setIsMuted: function(isMuted) {
            this.set('isMuted', isMuted);
            return isMuted;
        },
        getIsSelected: function() {
            var isSelected = this.get('isSelected');
            return isSelected; 
        },
        setIsSelected: function(isSelected) {
            this.set('isSelected', isSelected);
            return isSelected;
        }
    });
    
    /**
     * A collection of Instruments
     */
    var Instruments = Backbone.Collection.extend({
        model: Instrument
    });
    
    /**
     * 
     */
    var DummyInstrument = Instrument.extend({
        defaults: {
            'beatsSelected': []
        }
    });
    
    /**
     * The orchestra
     */
    var Orchestra = Backbone.Model.extend({
        defaults: {
            'controller': null,
            'player': null,
            'instrumentCollection': null,
            'dummyInstrument': null,
            'nextInstrumentId': 0,
            'scoreLength': 24
        },
        // getters | setters
        getController: function() {
            var controller = this.get('controller');
            return controller;
        },
        getPlayer: function() {
            var player = this.get('player');
            return player;
        },
        getInstrumentCollection: function() {
            var collection = this.get('instrumentCollection');
            return collection;
        },
        getInstruments: function() {
            var models = this.getInstrumentCollection().models;
            return models;
        },
        getDummyInstrument: function() {
            var dummy = this.get('dummyInstrument');
            return dummy;
        },
        getNextInstrumentId: function() {
            var nextInstrumentId = this.get('nextInstrumentId');
            return nextInstrumentId;
        },
        _setNextInstrumentId: function(newId) {
            this.set('nextInstrumentId', newId);
            return newId;
        },
        getScoreLength: function() {
            var scoreLength = this.get('scoreLength');
            return scoreLength;
        },
        _setScoreLength: function(newScoreLength) {
            this.set('scoreLength', newScoreLEngth);
            return newScoreLength;
        },
        
        // methods
        addNewInstrument: function(instrumentName) {
            var instrument = new Instrument({
                name: instrumentName
            });
            this.getInstrumentCollection().add(instrument);
            return instrument;
        }
    });
    
    //TODO refactor orchestra into player
    /** Object responsible for playing the orchestra */
    var Player = Backbone.Model.extend({
        defaults: {
            'playSpeed': 300,   // in milliseconds per square
            'currentBeat': 0,
            'isPlaying': false,
            'isLooping': false,
            'orchestra': null,
            'controller': null
        }
    });
        
    /**
     * The top-level controller class to complete MVC.
     * All top-level views should interface
     * only with this model. Methods which push Commands onto the
     * redo / undo stack are called invocations, and are prefixed with 
     * 'invoke_'
     */
    var Controller = Backbone.Model.extend({
        defaults: {
            // 'mode': 'synth' / 'game',
            'orchestra': null,
            'invoker': null,
        },
        
        getOrchestra: function() {
            var orchestra = this.get('orchestra');
            return orchestra;
        },
        getInvoker: function() {
            var invoker = this.get('invoker');
            return invoker;
        },
        
        // methods
        invoke_undo: function() {
            this.getInvoker().undo();
        },
        
        invoke_redo: function() {
            this.getInvoker().redo();
        }
    });
    
    // Declare | Views -----------------------------------------------------------------------------------------
    
    // Top level views ------------------------------
    /**
     * Abstract. For common methods used for handling several other subviews
     */
    var AbstractCompositeView = Backbone.View.extend({
        closeSubViews: function() {
            var i;
            if(this.subViews) {
                for(i = 0; i < this.subViews.length; i++) {
                    this.subViews[i].close();
                }
            }
        }
    });
    
    /**
     * Composite view. Top level view for the synthesizer component
     * Expected model: Controller
     */
    var TopLevelView = AbstractCompositeView.extend({
        el: '#body',
        model: null,
        template: SYNTH.templateCache['template-base'],
        subViews: [],
        initialize: function() {
            this.$el.html(this.template);
            
            this.subViews.push(new EditControlPanelView({model: this.model}));
            this.subViews.push(new PlayerControlPanelView({model: this.model}));
            this.subViews.push(new InstrumentControlPanelView({model: this.model}));
            this.subViews.push(new GridView({model: this.model})); 
            
        },
        close: function() {
            this.closeSubViews();
        }
    });
    
    // Grid views --------------------------------
    /**
     * Component view. Displays underlying grid for each instument within grid view
     * Expected model: Controller
     */
    var GridInstrumentView = Backbone.View.extend({
        el: '#part-control-array',
        collectionTemplate: SYNTH.templateCache['template-part-control-array'],
        collectionBinder: null,
        initialize: function() {
            
            var converter = function(direction, value) {
                if(value) {
                    return 'active';
                }
                return 'inactive';
            };
            
            var bindings = {
                'id': {
                    selector: '.part-control-block-inner',
                    elAttribute: 'data-id'
                },
                'isActive': {
                    selector: '.part-control-block-inner',
                    elAttribute: 'class',
                    converter: converter
                }
            };
            
            this.collectionBinder = new Backbone.CollectionBinder(
                new Backbone.CollectionBinder.ElManagerFactory(this.collectionTemplate, bindings)
            );
            
            this.render();
        },
        render: function() {
            this.collectionBinder.bind(this.model.getOrchestra().getInstrumentCollection(), this.el);
        },
        close: function() {
            this.collectionBinder.unbind();
        }
    });
    
    /**
     * Component view. Reponsible for grid left bar
     * Expected model: Controller
     */
    var GridLeftBar = Backbone.View.extend({
        el: '#part-left-lower',
        collectionTemplate: SYNTH.templateCache['template-beat-time'],
        collectionBinder: undefined,
        initialize: function() {
            
            var converter = function(direction, value) {
                return value + 1;
            };
            
            var bindings = {
                'id': [
                    {
                        selector: '.time',
                        converter: converter
                    },
                    {
                        selector: '.time',
                        elAttribute: 'data-time'
                    }
               ]
            };
            
            this._collectionBinder = new Backbone.CollectionBinder(
                new Backbone.CollectionBinder.ElManagerFactory(this.collectionTemplate, bindings)
            );
            
            this.render();
        },
        render: function() {
            this.collectionBinder.bind(this.model.getOrchestra().getDummyInstrument().getBeatsCollection(), this.el);
            return this;
        },
        events: {
            'mousedown .time': '_onMouseDownTime',
            'mousedown #part-left > div': '_preventDefault',
            'mousedown #part-anchor': '_unselectAllBeats',
            'mouseup': '_onMouseUp',
        },
        close: function() {
            this._collectionBinder.unbind();
        },
        
        // event handlers
        _onMouseDownTime: function(event) {
            var beat = $(event.currentTarget).attr('data-time');
            var isSelected = $('#part-controls .beat-control-block-inner[data-time="' + beat + '"]').attr('data-isselected');
            if(isSelected === 'true') {
                SYNTH.models.orchestra.setBeatSelection(parseInt(beat), false);
                this._delegateMouseOverTime(true);
            } else {
                SYNTH.models.orchestra.setBeatSelection(parseInt(beat), true);
                this._delegateMouseOverTime(false);
            }
            event.preventDefault();
        },
        _delegateMouseOverTime: function(bool) {
            if(bool) {
                this.$el.delegate('.time', 'mouseover', this._deSelectOnMouseOverBeat);
            } else {
                this.$el.delegate('.time', 'mouseover', this._selectOnMouseOverBeat);
            }
        },
        _selectOnMouseOverBeat: function(event) {
            SYNTH.models.orchestra.setBeatSelection(parseInt($(event.currentTarget).html()) - 1, true);
        },
        _deSelectOnMouseOverBeat: function(event) {
            SYNTH.models.orchestra.setBeatSelection(parseInt($(event.currentTarget).html()) - 1, false);
        },
        _onMouseUp: function(event) {
            this.$el.undelegate('.time', 'mouseover');
        },
        _unselectAllBeats: function(event) {
            this.model.unselectAllBeats();
        },
        _preventDefault: function(event) {
            event.preventDefault();
        }
    });
    
    //TODO
    /**
     * Component view. Responsible for grid top bar
     * Expected model: Controller
     */
    var GridTopBar = Backbone.View.extend({
        
    });
    
    /**
     * Composite view for the synthesizer grid
     * Expected model: Controller
     */
    var GridView = AbstractCompositeView.extend({
        el: '#site-content-wrapper',
        model: null,
        template: null, // has no template
        subViews: [],
        initialize: function() {
            this.subViews.push(new GridInstrumentView({model: this.model}));
            this.subViews.push(new GridInstrumentView({model: this.model}));
            this.subViews.push(new GridInstrumentView({model: this.model}));
        },
        // this view does not render
        close: function() {
            this.closeSubViews();
        }
    });
    
    // Control panels views ------------------------
    
    var PlayerControlPanelView = Backbone.View.extend({
        el: '#player-controls',
        model: null,
        template: SYNTH.templateCache['template-player-controls'],
        initialize: function() {
            this.$el.html(this.template);
        },
        close: function() {
            this.$el.empty();
            // default unbind behavior
        },
        events: {
            
        },
        bindings: {
            'button#button-play-pause': '',
            'button#button-to-beginning': 'disabled:isRedoStackEmpty'
        }
    });
    
    // done
    var InstrumentControlPanelView = Backbone.View.extend({
        el: '#instrument-list',
        model: null,
        collectionTemplate: SYNTH.templateCache['template-instrument-control-block'],
        instrumentCollectionBinder: null,
        initialize: function() {
            
            var converter = function(direction, value) {
                if(value) { return 'btn-primary'; }
                return 'btn-default';
            };
            
            var bindings = {
                'name': {
                    selector: '[data-binding="name"]'
                },
                'id': [
                    {
                        selector: '[data-binding="instrument-id"]'
                    },
                    {
                        selector: '.instrument-control-block',
                        elAttribute: 'data-id'
                    }
                ],
                'volume': '[data-binding="volume"]',
                'isActive': {
                    selector: '.instrument-control-block',
                    elAttribute: 'class',
                    converter: converter
                }
            };
            
            this.collectionBinder = new Backbone.CollectionBinder(
                    new Backbone.CollectionBinder.ElManagerFactory(this.collectionTemplate, bindings));
            this.render();
        },
        render: function() {
            this.collectionBinder.bind(this.model.getOrchestra().getInstrumentCollection(), this.el);
            return this;
        }
    });
    
    // done
    var EditControlPanelView = Backbone.View.extend({
        el: '#edit-controls',
        model: null,
        invokerModelBinder: null,
        template: SYNTH.templateCache['template-edit-controls'],
        initialize: function() {
            this.$el.html(this.template);
            this.invokerModelBinder = new Backbone.ModelBinder();
            this.render();
        },
        render: function() {
            
            function buttonConverter(direction, value) {
                if(value.length === 0) {
                    return true;
                }
                return false;
            };
            
            this.invokerModelBinder.bind(this.model.getInvoker(), this.el, {
                undoStack: {
                    selector: '#button-undo',
                    elAttribute: 'disabled',
                    converter: buttonConverter
                },
                redoStack: {
                    selector: '#button-redo',
                    elAttribute: 'disabled',
                    converter: buttonConverter
                }
            });
        },
        close: function() {
            this.invokerModelBinder.unbind();
            this.$el.empty();
        },
        events: {
            'click #button-undo': '_undo',
            'click #button-redo': '_redo',
            'change:undoStack': 'render',
            'change:redoStack': 'render'
        },
        
        // event handlers
        _undo: function() {
            this.model.invoke_undo();
        },
        _redo: function() {
            this.model.invoke_redo();
        }
    });

    // Expose - for testing purposes only ---------------------------------------
    return {
        // constants
        TONES: SYNTH.TONES,
        FREQS: SYNTH.FREQS,
        
        // models
        Command: Command,
        Invoker: Invoker,
        Note: Note,
        Notes: Notes,
        Pitch: Pitch,
        Pitches: Pitches,
        SoundGenerator: SoundGenerator,
        Instrument: Instrument,
        Instruments: Instruments,
        Orchestra: Orchestra,
        Player: Player,
        Controller: Controller,
        
        // views
        TopLevelView: TopLevelView
    };
});
SYNTH.prototype = {};
SYNTH = SYNTH(jQuery, _, Backbone, T, MUSIC, Note, Interval);

// ================================================================================
// That's the end of the lib - now we initialize the UI and the application
// We store the app within the SYNTH namespace to not use another global var
// ================================================================================
SYNTH.App = {};

// Op | Document.ready --------------------------------------------------------------------------------
$(document).ready(function() {
    
    // Establish | Variables ---------------------------------------------------------------------------
    SYNTH.App.domCache = {};
    
    // Op | Initialize models -----------------------------------------------------------------------------
    SYNTH.App.controller = new SYNTH.Controller({
        'orchestra': new SYNTH.Orchestra({
            instrumentCollection: new SYNTH.Instruments()
        }),
        'invoker': new SYNTH.Invoker()
    });
    
    // Initialize top level views
    SYNTH.App.topView = new SYNTH.TopLevelView({model: SYNTH.App.controller});
    
    // Preconfigure orchestra
    SYNTH.App.controller.getOrchestra().addNewInstrument('instrument1');
    SYNTH.App.controller.getOrchestra().addNewInstrument('instrument2');
    
    // UI ops
    (function() {
        
        function initializeKeyboard() {
            var left = $('#part-top');
            var i;
            var div;
            var str;
            for(i = 0; i < 88; i++) {
                str = SYNTH.TONES[i];
                div = $('<div></div>');
                div.append($('<div><input type="checkbox" data-binding="' + i + '"></input></div>'));
                if(str.length > 2) {
                    div.append($('<div>' + str.substr(0, 2)+ '</div>'));
                    div.append($('<div>&nbsp;</div>'));
                    div.addClass('black-key');
                } else {
                    div.append($('<div>&nbsp;</div>'));
                    div.append($('<div>' + str.charAt(0)+ '</div>'));
                }
                div.append($('<div class="num">' + str.charAt(str.length - 1) + '</div>'));
                left.append(div);
            }
        }
        
        function resizeUI() {
            var windowHeight = $(window).height() - 100 - 25;    // 100px #site-top 25px #site-bottom
            var partHeight = windowHeight - 60; // 60px static top frequency row
            var instrumentControlHeight = windowHeight - 100 - 25 - 20;   // ditto above - 20px instrument .nav-menu 
            $('#site-main').attr({'style': 'height: ' + windowHeight + 'px;'});
            $('#part-controls').attr({'style': 'height: ' + partHeight + 'px;'});
            $('#instrument-controls').attr({'style': 'height: ' + instrumentControlHeight + 'px;'});
        }
        
        initializeKeyboard();
        resizeUI();
        $(window).resize(resizeUI);
        
        $('#site-bottom').click(function() {
            $(this).toggleClass('expanded');
        });
    }());
    
    // Scroll syncing
    SYNTH.App.domCache.top = $('#part-top');
    SYNTH.App.domCache.left = $('#part-left');
    $('#part-controls').scroll(function() {
        SYNTH.App.domCache.top.attr({'style': 'left: ' + (- this.scrollLeft) + 'px'});
        SYNTH.App.domCache.left.attr({'style': 'top: ' + (- this.scrollTop + 160) + 'px'});
    });
    
});


