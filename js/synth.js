/**
 * @author Li Quan Khoo
 */


/*
 * Currently global scope to be accessible from developer console
 */
var SYNTH = SYNTH || {};

(function($, Backbone, Timbre, MUSIC, Note, Interval) {
    
    if(! $) { throw 'jQuery not available.'; }
    if(! Backbone) { throw 'Backbone.js not available.'; }
    if(! Timbre) { throw 'Timbre.js not available. '; }
    if(! MUSIC || ! Note || ! Interval) { throw 'MUSIC.js not available. '; }
    
    // Template cacher ------------------------------------------------------------------------------
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
    
    // Define the template cache object and cache them
    SYNTH.templateCache = {};
    cacheTemplates(SYNTH.templateCache, 'templates/templates.html', '.template');
    
    
    // Augment Music.js library scale definition with chromatic scale
    MUSIC.scales['chromatic'] = MUSIC.scales['chromatic'] || ['minor second', 'major second', 'minor third', 'major third', 'fourth', 'augmented fourth', 'fifth', 'minor sixth', 'major sixth', 'minor seventh', 'major seventh'];
    
    
    // Generate frequency table -------------------------------------------------------
    (function() {
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
                SYNTH.FREQS.push(Note.fromLatin(SYNTH.TONES[i]).frequency());
            }
        }());
    }());
    
    
    // Sound definitions ----------------------------------------------------------------------------
    
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
    
    // Models ---------------------------------------------------------------------------------------
    
    /**
     * A note, which just has an id, which represents its pitch, from 0 - 87
     */
    var Note = Backbone.Model.extend({
        defaults: {
            'id': null,
            'beat': null,
        },
        
        getBeat: function() {
            var beat = this.get('beat');
            return beat;
        },
        
        setBeat: function(beat) {
            this.set({'beat': beat});
        }
    });
    
    /** Collection of notes */
    var Notes = Backbone.Collection.extend({
        model: Note
    });
    
    
    /**
     * A beat, which contains information about all 88 notes of an instrument in one beat.
     * Initialization is handled by Instrument class and above
     * 
     * Notes are stored within a cache array of bools (attributes 0 - 87) for fast reads during playback.
     * 
     * The same information is held within a collection of Notes, for Backbone to only create an HTML element
     * when the note is active. This enables huge performance gains as the browser doesn't re-render or
     * recalculate classes during changes / playback scrolling.
     * Backbone ModelBinder converters don't work -- they are always string-escaped
     * so one cannot return HTML elements.
     * For everything to work, this collection only contains Notes which are active, and this must always be in
     * sync with the boolean array.
     */
    var Beat = Backbone.Model.extend({
        
        defaults: function() {
            
            var obj = {
                'id': null,
                'instrumentId': undefined,
                'isSelected': false,
                'array': null,
                'notes': null
            };
            
            var i;
            var array = [];
            for(i = 0; i < 88; i++) {
                array[i] = false;
            }
            obj['array'] = array;
            return obj;
            
        },
        
        /** Get id (time) of beat */
        getTime: function() {
            var time = this.get('id');
            return time;
        },
        
        /** Sets id (time) of beat */
        setTime: function(time) {
            this.set({'id': time});
        },
                
        /** Get note */
        getNote: function(pitch) {
            var note = this._getArray()[pitch];
            return note;
        },
        
        _getArray: function() {
            var array = this.get('array');
            return array;
        },
        
        _setArray: function(pitch, value) {
            var array = this._getArray();
            array[pitch] = value;
        },
        
        getNotesCollection: function() {
            var notesCollection = this.get('notes');
            return notesCollection;
        },
        
        _setNotesCollection: function(pitch, value) {
            if(value) {
                var collection = this.getNotesCollection();
                collection.add(new Note({
                    'id': pitch,
                    'beat': this
                }));
                
            } else {
                this.getNotesCollection().remove(pitch);
            }
        },
        
        /** Set note */
        setNote: function(pitch, value) {
            this._setArray(pitch, value);
            this._setNotesCollection(pitch, value);
        },
        
        /** Toggle note */
        toggleNote: function(pitch) {
            // handle array
            var array = this._getArray();
            var value = ! array[pitch];
            this.setNote(pitch, value);
            return value;
        },
                
        /** Get instrument */
        getInstrumentId: function() {
            var instrumentId = this.get('instrumentId');
            return instrumentId;
        },
        
        /** Set isSelected */
        setIsSelected: function(bool) {
            this.set({isSelected: bool});
        }
        
    });
        
    /** Collection of beats */
    var Beats = Backbone.Collection.extend({
        model: Beat,
        
        initFromInstrumentId: function(instrumentId, scoreLength, generateViews) {
            var beat;
            var notes;
            var array;
            
            var i, j;
            for(i = 0; i < scoreLength; i++) {
                
                notes = new Notes();
                array = [];
                for(j = 0; j < 88; j++) {
                    array.push(false);
                }
                beat = new Beat({
                    'id': i,
                    'notes': notes,
                    'instrumentId': instrumentId
                });
                if(generateViews) {
                    var newNoteView = new NoteControlView({model: beat});
                }
                this.add(beat);
            }
            
            return this;
        }
    });
        
    /**
     * An instrument
     * One instrument contains:
     *   88 instances of Timbre objects - one the frequency of each piano key
     *   An Score object, controlling how the instrument is supposed to be played
     */
    var Instrument = Backbone.Model.extend({ // Instrument. Timbre object tagged with numeric id
        defaults: function() {
            
            var activePitches = [];
            var i;
            for(i = 0; i < 88; i++) {
                activePitches[i] = false;
            }
            
            return {
                'orchestra': undefined,
                'id': null,
                'name': '(unnamed)',
                'activePitches': activePitches,    // Frequencies which this instrument would play
                'beats': undefined,
                'loudness': 1,
                'soundCode': null,
                'isActive': false   // whether instrument is current instrument being edited
            };
        },
        
        /** Gets orchestra */
        getOrchestra: function() {
            var orchestra = this.get('orchestra');
            return orchestra;
        },
        
        /** Returns the integer id of the instrument */
        getId: function() {
            var id = this.get('id');
            return id;
        },
        
        /** Returns the name of the instrument */
        getName: function() {
            var name = this.get('name');
            return name;
        },
        
        /** Sets the name of the instrument */
        setName: function(newName) {
            this.set({'name': newName});
        },
        
        /** Get beats collection */
        getBeatsCollection: function() {
            var beatsCollection = this.get('beats');
            return beatsCollection;
        },
        
        /** Gets beats */
        getBeats: function() {
            var beats = this.get('beats');
            return beats.models;
        },
        
        /** Gets specific beat */
        getBeat: function(n) {
            var beatCollection = this.getBeatsCollection();
            return beatCollection.get(n);
        },
        
        /** Selects beat of given time value */
        setBeatSelection: function(time, isSelected) {
            var beat = this.getBeat(time);
            beat.setIsSelected(isSelected);
        },
        
        /** Set beat */
        setBeatsCollection: function(newBeats) {
            this.set({'beats': newBeats});
        },
        
        /** Add n beats at the end, starting from given beat */
        addBeats: function(n, startBeat) {
            var beatsCollection = this.getBeatsCollection();
            var i, j;
            var beat;
            var array;
            for(i = 0; i < n; i++) {
                notes = new Notes();
                array = [];
                for(j = 0; j < 88; j++) {
                    array.push(false);
                }
                beat = new Beat({
                    'id': startBeat + i,
                    'notes': notes,
                    'instrumentId': this.getId()
                });
                beatsCollection.add(beat);
                var newNoteView = new NoteControlView({model: beat});
            }
        },
        
        /** Sets specific beat */
        setNote: function(time, pitch, bool) {
            var beatsCollection = this.getBeatsCollection();
            beatsCollection.get(time).setNote(pitch, bool);
        },
        
        /** Toggles note for specific beat */
        toggleNote: function(time, pitch) {
            var beatsCollection = this.getBeatsCollection();
            return beatsCollection.get(time).toggleNote(pitch);
        },
                
        /** Gets loudness */
        getLoudness: function() {
            var loudness = this.get('loudness');
            return loudness;
        },
        
        /** Sets loudness */
        setLoudness: function(newLoudness) {
            this.set({'loudness': newLoudness});
        },
        
        /** Gets sound code */
        getSoundCode: function() {
            var soundCode = this.get('soundCode');
            return soundCode;
        },
        
        /** Sets sound code */
        setSoundCode: function(newsoundCode) {
            this.set({'soundCode': newsoundCode});
        },

        /** Get whether instrument is being actively edited */
        getIsActive: function() {
            var isActive = this.get('isActive');
            return isActive;
        },
        
        /** Set instrument as being actively edited */
        setIsActive: function(isActive) {
            this.set({isActive: isActive});
        }
        
    });
    
    /**
     * Collection of Instruments
     */
    var Instruments = Backbone.Collection.extend({
        model: Instrument
    });
    
    /**
     * The Orchestra
     * Responsible for keeping track of the tempo, all active instruments.
     */
    var Orchestra = Backbone.Model.extend({
        defaults: function() {
            var instruments = new Instruments();
            return {
                'TONES': undefined,
                'FREQS': undefined,
                'key': 'A',
                'scale': 'chromatic',   // 'chromatic', 'major', 'harmonic minor', 'melodic minor', 'major pentatonic', 'minor pentatonic'
                'mspb': 300,            // milliseconds per beat
                'currentBeat': 0,
                'beatsPerBar': 8,
                'barsPerAdd': 1,
                'beatsPerAdd': 1,
                'beatsSelected': {},
                'isLooping': true,
                'isPlaying': false,
                'player': null,         // the interval Timbre.js object responsible for keeping beat and playing everything
                'instruments': instruments,
                'dummyInstrument': undefined,
                'nextInstrumentId': 0,  // id given to next instrument added to orchestra
                'activeInstrumentId': undefined, 
                'scoreLength': 24       // 24 beats
            };
        },
        
        initialize: function() {
            var instrument = this._newInstrument(-1, null, 'dummy', false);
            this.set('dummyInstrument', instrument);
            
        },
        
        getDummyInstrument: function() {
            var instrument = this.get('dummyInstrument');
            return instrument;
        },
        
        // Instrument controls
        
        /** Gets the Collection of Instruments */
        getInstrumentCollection: function() {
            var collection = this.get('instruments');
            return collection;
        },
        
        /** Get the list of instruments registered on the orchestra */
        getInstruments: function() {
            var instruments = this.get('instruments');
            return instruments.models;
        },
        
        /** Get instrument with specified Id */
        getInstrumentById: function(id) {
            var instrumentCollection = this.getInstrumentCollection();
            return instrumentCollection.get(id);
        },
        
        _newInstrument: function(nextInstrumentId, soundCode, instrumentName, generateViews) {
            // Grab next id
            
            var scoreLength = this.getScoreLength();
            
            
            // Initialize the new instrument
            var instrument = new Instrument({
                'orchestra': this,
                'id': nextInstrumentId,
                'name': instrumentName,
                'soundCode': soundCode
            });
            var beats = new Beats().initFromInstrumentId(nextInstrumentId, scoreLength, generateViews);
            instrument.setBeatsCollection(beats);
            
            return instrument;
        },
        
        /** Add an Instrument to the orchestra */
        addInstrument: function(soundCode, instrumentName) {
            
            var nextInstrumentId = this.get('nextInstrumentId');
            var instrument = this._newInstrument(nextInstrumentId, soundCode, instrumentName, true);
            var instrumentCollection = this.getInstrumentCollection();
            
            var initialCount = instrumentCollection.models.length;
            
            // Update orchestra
            instrumentCollection.add(instrument);
            var newBeatControlView = new BeatControlView({model: instrument});
            if(initialCount === 0) {
                this.setActiveInstrument(nextInstrumentId);
            } 
            
            nextInstrumentId += 1;
            this.set({
                'nextInstrumentId': nextInstrumentId
            });            
            
        },
        
        /** Remove an Instrument from the orchestra */
        removeInstrument: function(id) {
            var instrumentsCollection = this.getInstrumentCollection();
            instrumentsCollection.pop(id);
        },
        
        /** Get current active instrument */
        getActiveInstrument: function() {
            var activeInstrument = this.getInstrumentById(this.get('activeInstrumentId'));
            return activeInstrument;
        },
        
        /** Set new active instrument */
        setActiveInstrument: function(id) {
            if(this.get('activeInstrumentId') !== undefined) {
                this.getInstrumentById(this.get('activeInstrumentId')).setIsActive(false);
            }
            this.set({'activeInstrumentId': id});
            this.getInstrumentById(id).setIsActive(true);
        },
        
        /** */
        setNoteToInstrument: function(instrumentId, beat, pitch, isActive) {
            this.getInstrumentById(instrumentId).setNote(beat, pitch, isActive);
        },
        
        // Score controls
        
        /** Gets score length */
        getScoreLength: function() {
            var scoreLength = this.get('scoreLength');
            return scoreLength;
        },
        
        /** Set score length */
        setScoreLength: function(newScoreLength) {
            this.set({'scoreLength': newScoreLength});
        },
        
        // Key and scale (tonality) controls
        
        /** Gets key */
        getKey: function() {
            var key = this.get('key');
            return key;
        },
        
        /** Sets key */
        setKey: function(newKey) {
            this.set({'key': newKey});
        },
        
        /** Get scale */
        getScale: function() {
            var scale = this.get('scale');
            return scale;
        },
        
        /** Set scale */
        setScale: function(newScale) {
            this.set({'scale': newScale});
        },
        
        // Beat controls
        
        /** Set how many milliseconds to take for a beat */
        setMspb: function() {
            var mspb = this.get('mspb');
            this.set({'mspb': mspb});
        },
        
        /** Get current beat */
        getCurrentBeat: function() {
            var currentBeat = this.get('currentBeat');
            return currentBeat;
        },
        
        /** Set current beat */
        setCurrentBeat: function(newCurrentBeat) {
            this.set({'currentBeat': newCurrentBeat});
        },
        
        /** Get beats per bar */
        getBeatsPerBar: function() {
            var beatsPerBar = this.get('beatsPerBar');
            return beatsPerBar;
        },
        
        /** Sets new number of beats per bar */
        setBeatsPerBar: function(newBeatsPerBar) {
            this.set({'beatsPerBar': newBeatsPerBar});
        },
        
        /** Adds new bars */
        addBars: function() {
            var beatsToAdd = this.get('barsPerAdd') * this.getBeatsPerBar();
            this._addBeats(beatsToAdd);
        },
        
        /** Add beats */
        addBeats: function() {
            var beatsPerAdd = this.get('beatsPerAdd');
            this._addBeats(beatsPerAdd);
        },
        
        _addBeats: function(beatsToAdd) {
            var instruments = this.getInstruments();
            var dummyInstrument = this.getDummyInstrument();
            var scoreLength = this.getScoreLength();
            
            dummyInstrument.addBeats(beatsToAdd, scoreLength);
            
            var i;
            for(i = 0; i < instruments.length; i++) {
                instruments[i].addBeats(beatsToAdd, scoreLength);
            }
            this.setScoreLength(scoreLength + beatsToAdd);
        },
        
        /** Toggle beat selection of given value for all instruments */
        
        setBeatSelection: function(timeValue, isSelected) {
            // not necessary, but cache increases performance when we deselect the beats
            var beatsSelected = this.get('beatsSelected');
            if(! beatsSelected[timeValue] && isSelected) {
                beatsSelected[timeValue] = true;
            } else {
                if(beatsSelected[timeValue] !== undefined && !isSelected) {
                    beatsSelected[timeValue] = undefined;
                }
            }
            
            var instruments = this.getInstruments();
            var i;
            for(i = 0; i < instruments.length; i++) {
                instruments[i].setBeatSelection(timeValue, isSelected);
            }
        },
        
        /** Unselects all beats for all instruments */
        unselectAllBeats: function() {
            
            var beatsSelected = this.get('beatsSelected');
            for(var property in beatsSelected) {
                if(beatsSelected.hasOwnProperty(property)) {
                    this.setBeatSelection(property, false);
                }
            }
            this.set({'beatsSelected': {}});
        },
        
        /** Delete beat at given time */
        _deleteBeat: function(time) {
            
            function del(time, instrument) {
                var beatsCollection = instrument.getBeatsCollection();
                beatsCollection.remove(time);
            }
            
            var i;
            var dummyInstrument = this.getDummyInstrument();
            var instruments = this.getInstruments();
            
            del(time, dummyInstrument);
            for(i = 0; i < instruments.length; i++) {
                del(time, instruments[i]);
            }
            
        },
        
        _shiftBeatsBackwards: function(time, places) {
            
            function shift(time, places, instrument) {
                var beatsCollection = instrument.getBeatsCollection();
                prevTime = beatsCollection.get(time).getTime();
                beatsCollection.get(time).setTime(prevTime - places); 
            }
            
            var i;
            var dummyInstrument = this.getDummyInstrument();
            var instruments = this.getInstruments();
            
            shift(time, places, dummyInstrument);
            for(i = 0; i < instruments.length; i++) {
                shift(time, places, instruments[i]);
            }      
            
        },
        
        /** Delete selected beats */
        deleteSelectedBeats: function() {
            var selectedBeats = this.get('beatsSelected');
            
            function isEmpty() {
                for(var prop in selectedBeats) {
                    if(selectedBeats.hasOwnProperty(prop)) {
                        return false;
                    }
                }
                return true;
            }
            
            if(! isEmpty(selectedBeats)) {
                
                var numOfDeletedBeats = 0;
                var i, j;
                for(i = 0; i < this.getScoreLength(); i++) {
                    instruments = this.getInstruments();
                    if(selectedBeats[i] !== undefined) {
                        this._deleteBeat(i);
                        numOfDeletedBeats++;
                    } else if(numOfDeletedBeats != 0) {
                        this._shiftBeatsBackwards(i, numOfDeletedBeats);
                    }
                }
                this.set({'beatsSelected': {}});
                this.setScoreLength(this.getScoreLength() - numOfDeletedBeats);
            }
            
        },
        
        // Player controls
        
        /** Get loop */
        getIsLooping: function(bool) {
            var isLooping = this.get('isLooping');
            return isLooping;
        },
        
        /** Set loop */
        setIsLooping: function(bool) {
            this.set({'isLooping': bool});
        },
        
        /** Toggles loop */
        toggleLoop: function() {
            if(this.getIsLooping()) {
                this.setIsLooping(false);
            } else {
                this.setIsLooping(true);
            }
        },
        
        /** Get is playing status */
        getIsPlaying: function() {
            var isPlaying = this.get('isPlaying');
            return isPlaying;
        },
        
        /** Get player */
        _getPlayer: function() {
            var player = this.get('player');
            return player;
        },
        
        /** Play all instruments registered within the orchestra */
        play: function() {
            this.playFromBeat(0);
        },
        
        /** Play from beat n */
        playFromBeat: function(startBeat) {
            
            var self = this;
            
            // get milliseconds per beat
            var mspb = this.get('mspb');
            
            // set current beat to given offset
            this.setCurrentBeat(startBeat);
            
            
            var loopOffset = 0;
            var currentBeat = self.getCurrentBeat();
            var instruments = self.getInstruments();
            var i, j;
            var timbreArray;
            var beat = null;
            // initialize interval Timbre.js object, set to play the instruments
            this.set({'player': Timbre('interval', {interval: mspb}, function(count) {
                    
                    for(i = 0; i < instruments.length; i++) {
                        beat = instruments[i].getBeats()[currentBeat];
                        if(! beat) {
                            self.stop();
                            break;
                        } else {
                            self.setCurrentBeat(currentBeat);
                        }
                        timbreArray = [];
                        //TODO: optimization
                        // Cache which columns actually have anything in them in the whole piece
                        // since it is very unlikely that an instrument would use all 88 pitches
                        // and only scan those columns
                        for(j = 0; j < 88; j++) {
                            if(beat.getNote(j) === true) {
                                timbreArray.push(self.get('FREQS')[j]);
                            }
                        }
                        makeTimbre(instruments[i].getSoundCode(), timbreArray).play();
                    }
                    if(beat) {
                        currentBeat = startBeat + count - loopOffset;
                        currentBeat += 1;
                        if(currentBeat >= self.getScoreLength() && self.getIsLooping()) {
                            currentBeat = 0;
                            loopOffset += self.getScoreLength();
                        }
                    }
                })
            });
            var player = this.get('player');
            player.start();
            this.set({'isPlaying': true});
        },
        
        /** Stop all instruments registered within the orchestra */
        stop: function() {
            var player = this._getPlayer();
            player.stop();
            this.set({'isPlaying': false});
        },
        
        /** Toggles stop or play depending on current state */
        togglePlay: function() {
            if(this.getIsPlaying()) {
                this.stop();
            } else {
                this.playFromBeat(this.getCurrentBeat());
            }
        },
        
        /** Stop playing and rewind to beginning */
        rewindToStart: function() {
            this.stop();
            this.setCurrentBeat(0);
        },
        
        /** Stop playing and fast forward to end */
        forwardToEnd: function() {
            this.stop();
            this.setCurrentBeat(this.getScoreLength());
        }
        
    });
        
    // Views ----------------------------------------------------------------------------------------
    
    var PlayerControlView = Backbone.View.extend({
        el: '#player-controls',
        _template: SYNTH.templateCache['template-player-controls'],
        _modelBinder: undefined,
        initialize: function() {
            this._modelBinder = new Backbone.ModelBinder();
            this.render();
        },
        
        render: function() {
            var playButtonConverter = function(direction, value) {
                if(value) {
                    return 'glyphicon glyphicon-pause';
                } else {
                    return 'glyphicon glyphicon-play';
                }
            };
            
            var loopButtonConverter = function(direction, value) {
                if(value) {
                    return 'active';
                } else {
                    return '';
                }
            };
            
            var inputBarConverter = function(direction, value) {
                if(direction === 'ViewToModel') {
                    return parseInt(value) - 1;
                } else {
                    return value + 1;
                }
                
            };
            
            this.$el.html(this._template);
            var bindings = {
                'isPlaying': {
                    selector: '#button-play-pause',
                    elAttribute: "class",
                    converter: playButtonConverter
                },
                'currentBeat': [
                    {
                        selector: '[data-attr="beat"]',
                        converter: inputBarConverter
                    },
                    {
                        selector: '#input-playback-bar',
                        converter: inputBarConverter
                    }
                ],
                'scoreLength': [
                    {
                        selector: '#input-playback-bar',
                        elAttribute: 'max'
                    },
                    {
                        selector: '#score-length'
                    }
                ],
                'isLooping': {
                    selector: '#button-loop',
                    elAttribute: 'class',
                    converter: loopButtonConverter
                }
            };
            this._modelBinder.bind(this.model, this.el, bindings);
            return this;
        },
        
        close: function() {
            this._modelBinder.unbind();
            this.$el.empty();
        },
        
        events: {
            'click #button-play-pause': 'togglePlay',
            'click #button-to-beginning': 'rewindToStart',
            'click #button-to-end': 'forwardToEnd',
            'click #button-loop': 'toggleLoop'
        },
        
        togglePlay: function() {
            this.model.togglePlay();
        },
        
        rewindToStart: function() {
            this.model.rewindToStart();
        },
        
        forwardToEnd: function() {
            this.model.forwardToEnd();
        },
        
        toggleLoop: function() {
            this.model.toggleLoop();
        }
        
    });
    
    var InstrumentControlView = Backbone.View.extend({
        el: '#instrument-list',
        _componentTemplate: SYNTH.templateCache['template-instrument-control-block'],
        _modelBinder: undefined,
        _collectionBinder: undefined,
        initialize: function() {
            
            var converter = function(direction, value) {
                if(value) { return 'btn-primary'; }
                return 'btn-default';
            };
            
            var modelBindings = {
                'name': {
                    selector: '[data-attr="name"]'
                },
                'id': [
                    {
                        selector: '[data-attr="instrument-id"]'
                        
                    },
                    {
                        selector: '.instrument-control-block',
                        elAttribute: 'data-id'
                    }
                ],
                'loudness': '[data-attr="loudness"]',
                'isActive': {
                    selector: '.instrument-control-block',
                    elAttribute: 'class',
                    converter: converter
                }
            };
                        
            this._modelBinder = new Backbone.ModelBinder();
            this._collectionBinder = new Backbone.CollectionBinder(
                new Backbone.CollectionBinder.ElManagerFactory(this._componentTemplate, modelBindings)
            );
            this.render();
        },
        
        render: function() {
            this._collectionBinder.bind(this.model.getInstrumentCollection(), this.el);
            return this;
        },
        
        events: {
            'click .instrument-control-block': 'setAsActiveInstrument',
            'click *': 'stopPropagation'
        },
        
        close: function() {
            this._modelBinder.unbind();
            this._collectionBinder.unbind();
        },
        
        setAsActiveInstrument: function(event) {
            this.model.setActiveInstrument(parseInt($(event.target).attr('data-id')));
        },
        
        stopPropagation: function(event) {
            event.stopPropagation();
        }
        
    });
    
    var BeatControlView = Backbone.View.extend({
        el: '', // placeholder value
        _template: SYNTH.templateCache['template-beat-controls'],
        _componentTemplate: SYNTH.templateCache['template-beat-control-array'],
        _modelBinder: undefined,
        _collectionBinder: undefined,
        initialize: function() {
            this.el = '.part-control-block-inner[data-id="' + this.model.getId() + '"]';
            
            function plusOneConverter(direction, value) {
                return value + 1;
            }
            
            function strToBoolConverter(direction, value) {
                if(direction === 'ViewToModel') {
                    if(value === 'true') {
                        return true;
                    } else {
                        return false;
                    }
                }
            }
            
            var bindings = {
                'id': [
                    {
                        selector: '.beat-control-block-inner',
                        elAttribute: 'data-time'
                    }
                ],
                'isSelected': {
                    selector: '.beat-control-block-inner',
                    elAttribute: 'data-isselected'
                }
            };            
            
            this._modelBinder = new Backbone.ModelBinder();
            this._collectionBinder = new Backbone.CollectionBinder(
                new Backbone.CollectionBinder.ElManagerFactory(this._componentTemplate, bindings)
            );
            this.render();
            
        },
        
        render: function() {
            this._collectionBinder.bind(this.model.getBeatsCollection(), this.el);
            return this;
        },
        
        close: function() {
            this._collectionBinder.unbind();
        }
        
    });
    
    var NoteControlView = Backbone.View.extend({
        el: '',
        _template: undefined,
        _componentTemplate: SYNTH.templateCache['template-dot'],
        _modelBinder: undefined,
        _collectionBinder: undefined,
        initialize: function() {
            
            var bindings = {
                'id': {
                    'selector': '.dot',
                    'elAttribute': 'data-pitch'
                },
            };
            this.listenTo(this.model, 'change:id', this.rebindElAndRender);
            
            this.el = '.part-control-block-inner[data-id="' + this.model.getInstrumentId() + '"] .beat-control-block-inner[data-time="' + this.model.getTime() + '"]';
            this._collectionBinder = new Backbone.CollectionBinder(
                new Backbone.CollectionBinder.ElManagerFactory(this._componentTemplate, bindings)
            );
            this.render();
        },
        
        render: function() {
            this._collectionBinder.bind(this.model.getNotesCollection(), this.el);
            return this;
        },
        
        rebindElAndRender: function() {
            this._collectionBinder.unbind();
            this.el = '.part-control-block-inner[data-id="' + this.model.getInstrumentId() + '"] .beat-control-block-inner[data-time="' + this.model.getTime() + '"]';
            this.render();
        },
        
        foo: function() {
            console.log('foo');
        },
        
        close: function() {
            this._collectionBinder.unbind();
        }
    });
    
    var BarControlView = Backbone.View.extend({
        el: '#add-bar-controls',
        _template: SYNTH.templateCache['template-bar-controls'],
        _modelBinder: undefined,
        initialize: function() {
            this._modelBinder = new Backbone.ModelBinder();
            this.render();
        },
        
        render: function() {
            
            var converter = function(direction, value) {
                if(direction === 'ViewToModel') {
                    return parseInt(value);
                }
                return value;
            };
            
            var bindings = {
                'beatsPerBar': [
                    {
                        selector: '#beats-per-bar-input',
                        converter: converter
                    },
                    {
                        selector: '#beats-per-bar-display'
                    }
                ],
                'barsPerAdd': {
                    selector: '#bars-per-addition',
                    converter: converter
                },
                'beatsPerAdd': {
                    selector: '#beats-per-addition',
                    converter: converter
                }
            };
            
            this.$el.html(this._template);
            this._modelBinder.bind(this.model, this.el, bindings);
        },
        
        events: {
            'click #button-add-bars': 'addBars',
            'click #button-add-beats': 'addBeats',
            'click #button-delete-beats': 'deleteBeats'
        },
        
        close: function() {
            this._modelBinder.unbind();
            this.$el.empty();
        },
        
        addBars: function(event) {
            this.model.addBars();
        },
        
        addBeats: function(event) {
            this.model.addBeats();
        },
        
        deleteBeats: function(event) {
            this.model.deleteSelectedBeats();
        }
    }); 
    
    var InstrumentPartView = Backbone.View.extend({
        el: '#part-control-array',
        _template: SYNTH.templateCache['template-part-controls'],
        _componentTemplate: SYNTH.templateCache['template-part-control-array'],
        _modelBinder: undefined,
        _collectionBinder: undefined,
        _beatCollectionBiner: undefined,
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
            this._collectionBinder = new Backbone.CollectionBinder(
                new Backbone.CollectionBinder.ElManagerFactory(this._componentTemplate, bindings)
            );
            this.render();
        },
        
        render: function() {
            this._collectionBinder.bind(this.model.getInstrumentCollection(), this.el);
            return this;
        },
                
        close: function() {
            this._collectionBinder.unbind();
        },
        
    });
    
    var InstrumentGridHeaderView = Backbone.View.extend({
        el: '#part-left',
        elAnchor: '#part-anchor',
        elLower: '#part-left-lower',
        _componentTemplate: SYNTH.templateCache['template-beat-time'],
        _collectionBinder: undefined,
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
                    new Backbone.CollectionBinder.ElManagerFactory(this._componentTemplate, bindings)
            );
            this.render();
        },
        
        render: function() {
            this._collectionBinder.bind(this.model.getDummyInstrument().getBeatsCollection(), this.elLower);
            return this;
        },
        
        events: {
            'mousedown .time': 'onMouseDownTime',
            'mousedown #part-left > div': 'preventDefault',
            'mousedown #part-anchor': 'unselectAllBeats',
            'mouseup': 'onMouseUp',
        },
        
        close: function() {
            this._collectionBinder.unbind();
        },
        
        onMouseDownTime: function(event) {
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
             
        onMouseUp: function(event) {
            this.$el.undelegate('.time', 'mouseover');
        },
        
        unselectAllBeats: function(event) {
            this.model.unselectAllBeats();
        },
        
        preventDefault: function(event) {
            event.preventDefault();
        }
        
    });
    
    var InstrumentGridView = Backbone.View.extend({
        el: '#grid-event-capture-layer',
        columnEl: '#grid-event-capture-layer-columns',
        contentEl: '#site-content',
        _componentTemplate: SYNTH.templateCache['template-grid-event-capture-layer-row'],
        _columnTemplate: SYNTH.templateCache['template-grid-event-capture-layer-column'],
        _contentBinder: undefined,
        _collectionBinder: undefined,
        initialize: function() {
                        
            this._contentBinder = new Backbone.ModelBinder();
            this._collectionBinder = new Backbone.CollectionBinder(
                    new Backbone.CollectionBinder.ElManagerFactory(this._componentTemplate, {})
            );
            $(this.columnEl).html(this._columnTemplate);
            this.render();
        },
        
        render: function() {
            
            var bindings = {
                'beatsPerBar': {
                    'selector': '#part-controls',
                    'elAttribute': 'data-bpb'
                }
            };
            
            this._contentBinder.bind(this.model, this.contentEl, bindings);
            this._collectionBinder.bind(this.model.getDummyInstrument().getBeatsCollection(), this.el);
            return this;
        },
        
        events: {
            'mousedown': 'calcCoords',
            'mouseup': 'onMouseUp'
        },
        
        close: function() {
            this._contentBinder.unbind();
            this._collectionBinder.unbind();
        },
        
        calcCoords: function(event) {
            event.preventDefault();
            //console.log('------------');
            //console.log(event.target);
            //console.log('clientX: ' + event.clientX + '\tY: ' + event.clientY);
            //console.log('offsetX: ' + event.offsetX + '\tY: ' + event.offsetY);
            //console.log('pageX  : ' + event.pageX + '\tY: ' + event.pageY);
            //console.log('screenX: ' + event.screenX + '\tY: ' + event.screenY);
            //console.log(event.originalEvent.layerX);
            //console.log(event.originalEvent.layerY);
            
            var beat;
            
            if(event.offsetY) { beat = Math.floor(event.originalEvent.offsetY / 20); } // Chrome / Opera
            else { beat = Math.floor(event.originalEvent.layerY / 20); } // Firefox
            var pitch = parseInt(event.target.getAttribute('data-pitch'));
            var isNowActive = this.model.getActiveInstrument().toggleNote(beat, pitch);
            
            // Just bind to something, as couldn't bind to self via ''. '*' is a bad idea and it triggers multiple events
            if(isNowActive) {
                this.$el.delegate('#grid-event-capture-layer-columns', 'mousemove', this._selectOnMouseMove);
            } else {
                this.$el.delegate('#grid-event-capture-layer-columns', 'mousemove', this._deSelectOnMouseMove);
            }
            
        },
        
        _selectOnMouseMove: function(event) {
            var beat;
            if(event.offsetY) { beat = Math.floor(event.originalEvent.offsetY / 20); } // Chrome / Opera
            else { beat = Math.floor(event.originalEvent.layerY / 20); } // Chrome / Opera
            var pitch = parseInt(event.target.getAttribute('data-pitch'));
            SYNTH.models.orchestra.getActiveInstrument().setNote(beat, pitch, true);
        },
        
        _deSelectOnMouseMove: function(event) {
            var beat;
            if(event.offsetY) { beat = Math.floor(event.originalEvent.offsetY / 20); } // Chrome
            else { beat = Math.floor(event.originalEvent.layerY / 20); } // Firefox
            var pitch = parseInt(event.target.getAttribute('data-pitch'));
            SYNTH.models.orchestra.getActiveInstrument().setNote(beat, pitch, false);
        },
        
        onMouseUp: function(event) {
            this.$el.undelegate('#grid-event-capture-layer-columns', 'mousemove');
        }
        
    });
        
    
    
    // Variables ------------------------------------------------------------------------------------
    
    SYNTH.views = {};
    SYNTH.models = {};
    SYNTH.dom = {};
    
    SYNTH.models.orchestra = new Orchestra({
        'TONES': SYNTH.TONES,
        'FREQS': SYNTH.FREQS
    });
    
    // Document.ready --------------------------------------------------------------------------------
    
    $(document).ready(function() {
                
        // Bind views
        /*
        SYNTH.views.playerControl = new PlayerControlView({model: SYNTH.models.orchestra});
        SYNTH.views.barControl = new BarControlView({model: SYNTH.models.orchestra});
        SYNTH.views.instrumentControl = new InstrumentControlView({model: SYNTH.models.orchestra});
        SYNTH.views.instrumentPartControl = new InstrumentPartView({model: SYNTH.models.orchestra});
        SYNTH.views.instrumentGridHeaderControl = new InstrumentGridHeaderView({model: SYNTH.models.orchestra});
        SYNTH.views.instrumentGridControl = new InstrumentGridView({model: SYNTH.models.orchestra});
        SYNTH.views.beatControls = {};
        */
        
        var playerControl = new PlayerControlView({model: SYNTH.models.orchestra});
        var barControl = new BarControlView({model: SYNTH.models.orchestra});
        var instrumentControl = new InstrumentControlView({model: SYNTH.models.orchestra});
        var instrumentPartControl = new InstrumentPartView({model: SYNTH.models.orchestra});
        var instrumentGridHeaderControl = new InstrumentGridHeaderView({model: SYNTH.models.orchestra});
        var instrumentGridControl = new InstrumentGridView({model: SYNTH.models.orchestra});
        
        // Preconfigure orchestra
        SYNTH.models.orchestra.addInstrument('synthPiano', 'instrument1');
        SYNTH.models.orchestra.addInstrument('synthPiano', 'instrument2');
        SYNTH.models.orchestra.addInstrument('synthPiano', 'instrument3');
        SYNTH.models.orchestra.addInstrument('synthPiano', 'instrument4');
        
        // UI ops
        function initUI() {
            
            function initializeTop() {
                var top = $('#part-top');
                var i;
                var div;
                var str;
                for(i = 0; i < 88; i++) {
                    str = SYNTH.TONES[i];
                    div = $('<div></div>');
                    if(str === 'C4') {
                        div.attr({'id': 'mid'});
                    }
                    if(str.length > 2) {
                        div.append($('<div>' + str.substr(0, 2)+ '</div>'));
                        div.append($('<div>&nbsp;</div>'));
                        div.addClass('black-key');
                    } else {
                        div.append($('<div>&nbsp;</div>'));
                        div.append($('<div>' + str.charAt(0)+ '</div>'));
                    }
                    div.append($('<div class="num">' + str.charAt(str.length - 1) + '</div>'));
                    top.append(div);
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
            
            initializeTop();
            resizeUI();
            $(window).resize(resizeUI);
            
            $('#site-bottom').click(function() {
                $(this).toggleClass('expanded');
            });
        }
        
        initUI();
        SYNTH.dom.top = $('#part-top');
        SYNTH.dom.left = $('#part-left');
        
        // Scroll syncing
        $('#part-controls').scroll(function() {
            SYNTH.dom.top.attr({'style': 'left: ' + (- this.scrollLeft) + 'px'});
            SYNTH.dom.left.attr({'style': 'top: ' + (- this.scrollTop + 160) + 'px'});
        });
        
    });
    
    
}(jQuery, Backbone, T, MUSIC, Note, Interval));

