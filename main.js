/*
Корень
Связывает дочерние объекты
*/
var PlantIDE = {
    get_file: function(event) {
        var selected_file = PlantIDE.Loader.select_file(event);
        if (selected_file.is_error) {
            PlantIDE.Viewer.show_error();
        } else {
            PlantIDE.Viewer.set_filename_text(selected_file.content);
        }
    },
    start: function() {
        this.show_error = PlantIDE.Viewer.show_error;
        this.hide_error = PlantIDE.Viewer.hide_error;
        this.bind_file_selection();
        this.bind_reader();
    },
    bind_file_selection: function() {
        let file_input = document.getElementsByClassName('file')[0];
        let svg_btn = document.getElementsByClassName('svg-btn')[0];

        file_input.addEventListener('change', PlantIDE.get_file, false);
        svg_btn.onclick = function(event) {file_input.click();};
    },
    bind_reader: function() {
        PlantIDE.Loader.reader.onloadstart = function(event) {
            PlantIDE.Viewer.set_codearea_content(PlantIDE.Viewer.LOADING_STR);
        };
        PlantIDE.Loader.reader.onloadend = function(event) {
            PlantIDE.bootstrap(event);
        };
        PlantIDE.Loader.reader.onerror = this.show_error;
    },
    bootstrap: function(event) {
        raw_text = event.target.result;
        var loaded_diagram = PlantIDE.Loader.get_diagram_code(raw_text);
        var loaded_svg = PlantIDE.Loader.get_svg(raw_text);

        if (loaded_diagram.is_error || loaded_svg.is_error) {
            PlantIDE.show_error();
        } else {
            diagram_code = loaded_diagram.content;
            svg_text = loaded_svg.content;
            var parsed_svg = PlantIDE.Parser.parse_diagram(diagram_code, svg_text);

            if (parsed_svg.is_error) {
                PlantIDE.show_error(parsed_svg.err_msg);
            } else {
                PlantIDE.Viewer.set_codearea_content(diagram_code);
                diagram_svg = PlantIDE.Viewer.set_diagramarea_child(parsed_svg.content);

                PlantIDE.Viewer.create_entity_lists(PlantIDE.Parser.entities_to_num);
                PlantIDE.Viewer.reload();
                PlantIDE.hide_error();
            }
        }
    }
};


/*
Загружает файл диаграммы
Возвращает текст описания и объект SVG
*/
PlantIDE.Loader = (function() {
    var current_file, diagram_code, svg_text, diagram_svg;


    return {
        reader: new FileReader(),
        select_file: function(event) {
            current_file = event.target.files[0];
            var output = [];

            size = ((current_file.size/1024).toFixed(2) + ' Кб') || '';
            upd_date = new Date(current_file.lastModified);
            upd_date = current_file.lastModified ? (', ' + upd_date.toLocaleTimeString() + ' - ' + upd_date.toLocaleDateString()) : ''

            output.push(current_file.name + ' (' + size + upd_date +')');

            if (current_file.type != "image/svg+xml") {
                return {is_error: true}
            } else {
                this.reader.readAsText(current_file);
                return {
                    is_error: false,
                    content: output
                }
            }
        },
        get_diagram_code: function(raw_text) {
            raw_text = raw_text.replace(/- -/g, "--");
            raw_text = raw_text.replace(/\. \./g, "..");
            let start_ind = raw_text.indexOf('@startuml');
            let end_ind = raw_text.indexOf('@enduml')+7;
            if (start_ind !== -1 && end_ind !== -1) {
                return {
                    is_error: false,
                    content: raw_text.substring(start_ind, end_ind)
                }
            } else {
                return {is_error: true};
            }
        },
        get_svg: function(raw_text) {
            let start_ind = raw_text.indexOf('<svg');
            let end_ind = raw_text.indexOf('</svg>')+6;
            if (start_ind !== -1 && end_ind !== -1) {
                return {
                    is_error: false,
                    content: raw_text.substring(start_ind, end_ind)
                }
            } else {
                return {is_error: true}
            }
        }
    }
})();


/*
Парсит и модифицирует SVG
Возвращает новый объект SVG
*/
PlantIDE.Parser = (function() {
    let svg_headers;
    var num_to_entities = Object();
    var entities_to_num = Object();

    function change_brackets(svg_text) {
        return svg_text.replace(/«/g, '{').replace(/»/g, '}');
    }
    function get_svg_headers(svg_text) {
        return svg_text.match(/<svg.*?<\/defs>/g);
    }
    function get_entities(diagram_code) {
        var reg = new RegExp('(class|entity|enum) [^\{]*', 'g');

        diagram_code.match(reg).forEach(function(item, index) {
            var entity = item.replace(/class|entity|enum|\s/g, '').replace(/<<.*?>>/g, '');     // последний replace удаляет указание стереотипа
            num_to_entities['e'+index.toString()] = entity;
            entities_to_num[entity] = 'e'+index.toString();
        });

        return [entities_to_num, num_to_entities];
    }
    function assign_main_nums(entities_to_num, svg_text) {
        var raw_reg = new RegExp('--class.*?<!', 'g');
        var name_reg = new RegExp('--class.*?-->', 'g');
        var name;
        var entities_wrapper = make_valid_svg('');
        entities_wrapper.children[0].children[1].classList.add('entities_wrapper');
        var entity;


        svg_text.match(raw_reg).forEach(function(item, index) {
            name = item.match(name_reg)[0].replace(/--class |-->/g, '');

            entity = make_valid_svg(item.replace(/(--class.*-->)|<!/g, '')).children[0].children[1];
            entity.classList.add("entity");
            entity.dataset.num = entities_to_num[name].toString();

            entities_wrapper.children[0].children[1].appendChild(entity);
        });

        return entities_wrapper;
    }
    function assign_link_nums(entities_to_num, svg_text) {
        var raw_reg = new RegExp('--link.*?<!', 'g');
        var from_reg = new RegExp('--link.*?to', 'g');
        var to_reg = new RegExp('to.*?-->', 'g');
        var from_name, to_name;
        var links_wrapper = make_valid_svg('');
        links_wrapper.children[0].children[1].classList.add('links_wrapper');
        var link;


        svg_text.match(raw_reg).forEach(function(item, index) {
            from_name = item.match(from_reg)[0].replace(/--link | to/g, '');
            to_name = item.match(to_reg)[0].replace(/to |-->/g, '');

            link = make_valid_svg(item.replace(/(--class.*-->)|<!/g, '')).children[0].children[1];
            link.classList.add("link");

            if (entities_to_num.hasOwnProperty(from_name) && entities_to_num.hasOwnProperty(from_name)) {
                link.classList.add(entities_to_num[from_name]);
                link.classList.add(entities_to_num[to_name]);
                links_wrapper.children[0].children[1].appendChild(link);
            }
        });

        return links_wrapper;
    }
    function make_valid_svg(svg_text) {
        return new DOMParser().parseFromString(svg_headers+'<g>'+svg_text+'</g></svg>', 'application/xml');
    }


    return {
        entities_to_num: entities_to_num,
        num_to_entities: num_to_entities,
        parse_diagram: function(diagram_code, svg_text) {
            try {
                // 0. Заменить «» на {} для парсинга
                // svg_text = change_brackets(svg_text);

                // 1. Получить необходимые заголовки для парсинга DOMParser
                svg_headers = get_svg_headers(svg_text);

                // 2. Узнать имена сущностей и сопоставить с числами (от нуля) - парсинг текста описания диаграммы
                [entities_to_num, num_to_entities] = get_entities(diagram_code);

                // 3. Добавить сущностям числа их имен - парсинг текста svg
                var entities_wrapper = assign_main_nums(entities_to_num, svg_text);

                // 4. Сопоставить связям числа имен сущностей - парсинг текста svg
                var links_wrapper = assign_link_nums(entities_to_num, svg_text);

                // 5. Объединить обертки сущностей и связей
                diagram_svg = entities_wrapper.children[0];
                diagram_svg.appendChild(links_wrapper.children[0].children[1]);

                return {
                    is_error: false,
                    content: diagram_svg
                }
            }
            catch (error) {
                return {
                    is_error: true,
                    err_msg: error
                }
            }
        }
    }
})();


/*
Привязывает события управления SVG и выделения объектов
Отображает ошибки, SVG, код описания и прочее
*/
PlantIDE.Viewer = (function() {
    let PAN_SPEED = 2;
    let SCALE_STEP = 1.5;
    var scale_factor = 1;
    var fit_scale_factor;

    let code_area = document.getElementsByClassName('code')[0];
    let diagram_area = document.getElementsByClassName('diagram')[0];
    let filename_label = document.getElementsByClassName('file-name')[0];
    let fit_btn = document.getElementsByClassName('fit')[0];
    let reset_btn = document.getElementsByClassName('reset')[0];
    let entity_lists = Array.from(document.getElementsByClassName('entity-list')).splice(0,2);
    let entities, links;

    function init_entity_list(list, entities_to_num) {
        list.innerHTML = '';
        for (const [entity, num] of Object.entries(entities_to_num)) {
            var list_item = document.createElement("li");
            list_item.innerHTML = entity;
            list.appendChild(list_item);
            list_item.dataset.num = num;
        }
    }
    function assign_entity_list(list) {
        Array.from(list.children).forEach(function(list_item, index) {
            var classes = Array.from(document.querySelectorAll('.entity[data-num="'+list_item.dataset.num+'"]')[0].classList);
            list_item.classList.add('entity');
            classes.forEach(function(class_item, index) {
                list_item.classList.add(class_item);
            });
        });
    }
    function zoom_diagram(event) {
        if (diagram_svg) {
            if (event.deltaY < 0) {
                zoom_in();
            } else {
                zoom_out();
            }
            // var moveto_coords = get_svg_coords();
            // set_svg_coords(moveto_coords);
            event.preventDefault();
        }
    }
    function zoom_in() {
        scale_factor *= SCALE_STEP;
        set_svg_scale(scale_factor);
    }
    function zoom_out() {
        scale_factor /= SCALE_STEP;
        set_svg_scale(scale_factor);
    }
    function set_svg_scale(scale_factor) {
        diagram_svg.style.transform = 'scale('+scale_factor+')';
    }
    function get_svg_coords() {
        // через transformOrigin
        // var origin_coords = diagram_svg.style.transformOrigin.split(' ');
        // return {
        //     x: parseInt(origin_coords[0]),
        //     y: parseInt(origin_coords[1])
        // };

        // через left-top
        return {
            x: parseInt(diagram_svg.style.left),
            y: parseInt(diagram_svg.style.top)
        }
    }
    function set_svg_coords(coords) {
        // через transformOrigin
        // diagram_svg.style.transformOrigin = Math.ceil(coords.x) + 'px ' + Math.ceil(coords.y) + 'px';

        // через left-top
        diagram_svg.style.left = coords.x + 'px';
        diagram_svg.style.top = coords.y + 'px';
        // console.log(coords);
    }
    function move_left() {
        var step = diagram_svg.getBoundingClientRect().width * 0.05;
        var origin_coords = get_svg_coords();
        origin_coords.x += step;
        set_svg_coords(origin_coords);
    }
    function move_right() {
        var step = diagram_svg.getBoundingClientRect().width * 0.05;
        var origin_coords = get_svg_coords();
        origin_coords.x -= step;
        set_svg_coords(origin_coords);
    }
    function move_up() {
        var step = diagram_svg.getBoundingClientRect().height * 0.05;
        var origin_coords = get_svg_coords();
        origin_coords.y += step;
        set_svg_coords(origin_coords);
    }
    function move_down() {
        var step = diagram_svg.getBoundingClientRect().height * 0.05;
        var origin_coords = get_svg_coords();
        origin_coords.y -= step;
        set_svg_coords(origin_coords);
    }
    function get_cursor_coords(event) {
        event = event || window.event;
        var pageX = event.pageX;
        var pageY = event.pageY;
        // IE 8
        if (pageX === undefined) {
            pageX = event.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
            pageY = event.clientY + document.body.scrollTop + document.documentElement.scrollTop;
        }
        return {
            x: pageX,
            y: pageY
        };
    }
    function calc_svg_coords() {
        var scale_mul = scale_factor / fit_scale_factor;
        var area_coords = {
            x: diagram_area.getBoundingClientRect().x,
            y: diagram_area.getBoundingClientRect().y
        };
        var svg_coords = {
            x: diagram_svg.getBoundingClientRect().x,
            y: diagram_svg.getBoundingClientRect().y
        };
        var origin_coords = get_svg_coords();
        var cursor_abs_coords = get_cursor_coords();
        var cursor_coords = {
            x: cursor_abs_coords.x - area_coords.x,
            y: cursor_abs_coords.y - area_coords.y - document.querySelector('html').scrollTop
        };

        // TODO: Координаты курсора в систему svg, а не контейнера + учет старого transformOrigin
        var new_svg_coords = {
            x: Math.ceil(cursor_coords.x - cursor_coords.x*scale_mul),
            y: Math.ceil(cursor_coords.y - cursor_coords.y*scale_mul)
        };
        // console.log('cursor:', cursor_coords, 'area:', area_coords, 'svg:', svg_coords, 'new_svg:', new_svg_coords, 'scale_factor:', scale_factor, 'scale_mul:', scale_mul);
        return new_svg_coords;
    }
    function fit() {
        if (diagram_svg) {
            var scale_width = diagram_area.clientWidth / diagram_svg.clientWidth;
            var scale_hight = diagram_area.clientHeight / diagram_svg.clientHeight;
            scale_factor = (scale_hight < scale_width) ? scale_hight : scale_width;
            fit_scale_factor = scale_factor;
            set_svg_scale(scale_factor);
            set_svg_coords({x: 0, y: 0});
        }
    }
    function bind_keyboard() {
        document.onkeydown = function(event) {
            // console.log(event.which);
            switch (event.which) {
                case 37:
                    move_left();
                    event.preventDefault();
                    break;
                case 38:
                    move_up();
                    event.preventDefault();
                    break;
                case 39:
                    move_right();
                    event.preventDefault();
                    break;
                case 40:
                    move_down();
                    event.preventDefault();
                    break;
                case 82:
                    show_all_elems();
                    break;
                case 70:
                    fit();
                    break;
                case 96:
                    show_all_elems();
                    break;
                case 97:
                    move_left();
                    move_down();
                    break;
                case 98:
                    move_down();
                    break;
                case 99:
                    move_right();
                    move_down();
                    break;
                case 100:
                    move_left();
                    break;
                case 101:
                    fit();
                    break;
                case 102:
                    move_right();
                    break;
                case 103:
                    move_left();
                    move_up();
                    break;
                case 105:
                    move_up();
                    move_right();
                    break;
                case 104:
                    move_up();
                    break;
                case 107:
                    zoom_in();
                    break;
                case 109:
                    zoom_out();
                    break;
                default:
                    break;
            }
        };
    }
    function bind_pan() {
        var panner = (function () {
            var last_cursor_coords = {x: 0, y: 0};
            var new_cursor_coords;
            var prev_coords;
            var moveto_coords;
            var origin_coords;
            var scale_mul = scale_factor / fit_scale_factor;
            var is_panning = false;
            return {
                start_pan: function (event) {
                    last_cursor_coords = get_cursor_coords();
                    is_panning = true;
                },
                stop_pan: function (event) {
                    is_panning = false;
                },
                while_pan: function (event) {
                    if (is_panning) {
                        // через left-top
                        new_cursor_coords = get_cursor_coords();
                        moveto_coords = get_svg_coords();
                        moveto_coords = {
                            x: (moveto_coords.x - (last_cursor_coords.x - new_cursor_coords.x)),
                            y: (moveto_coords.y - (last_cursor_coords.y - new_cursor_coords.y))
                        };
                        set_svg_coords(moveto_coords);
                        last_cursor_coords = get_cursor_coords();

                        // через style.transformOrigin
                        // new_cursor_coords = get_cursor_coords();
                        // origin_coords = get_svg_coords();
                        // prev_coords = {
                        //     x: parseInt(origin_coords.x),
                        //     y: parseInt(origin_coords.y)
                        // };
                        // moveto_coords = {
                        //     x: Math.ceil(prev_coords.x - (last_cursor_coords.x - new_cursor_coords.x)*scale_mul*PAN_SPEED),
                        //     y: Math.ceil(prev_coords.y - (last_cursor_coords.y - new_cursor_coords.y)*scale_mul*PAN_SPEED)
                        // };
                        // set_svg_coords(moveto_coords);
                        // last_cursor_coords = get_cursor_coords();
                    }
                }
            };
        } ());
        diagram_area.addEventListener('mousedown', panner.start_pan);
        diagram_area.addEventListener('mousemove', panner.while_pan);
        diagram_area.addEventListener('mouseup', panner.stop_pan);
        diagram_area.addEventListener('mouseout', panner.stop_pan);
    }
    function bind_highlight() {
        entities = Array.from(document.getElementsByClassName('entity'));
        links = Array.from(document.getElementsByClassName('link'));
        add_links_to_main(entities, links);

        entities.forEach(function(item, index) {
            item.onclick = function(event) {
                hide_all_elems();
                var num = this.dataset.num;
                var siblings = Array.from(document.getElementsByClassName(num));
                var selected_elems = Array.from(document.querySelectorAll('[data-num="'+num+'"]'));

                siblings.forEach(function(item, index) {
                    item.classList.add('sibling');
                    item.classList.remove('hidden');
                });

                selected_elems.forEach(function(item, index) {
                    item.classList.add('selected');
                    item.classList.remove('hidden');
                });
            }
        });
    }
    function add_links_to_main(entities, links) {
        var from_num, to_num, entity;
        var links_dict = Object();

        links.forEach(function(item, index) {
            from_num = item.classList[1];
            to_num = item.classList[2];
            if (!links_dict[from_num]) {
                links_dict[from_num] = Array();
            }
            links_dict[from_num].push(to_num);
            if (!links_dict[to_num]) {
                links_dict[to_num] = Array();
            }
            links_dict[to_num].push(from_num);
        });

        for (var num in links_dict) {
            if (links_dict.hasOwnProperty(num)) {
                Array.from(document.querySelectorAll('[data-num="'+num+'"]')).forEach(function(entity, index) {
                    links_dict[num].forEach(function(item, index) {
                        entity.classList.add(item);
                    });
                });
            }
        }
    }
    function hide_all_elems() {
        if (entities && links) {
            entities.forEach(function(item, index) {
                item.classList.add('hidden');
                item.classList.remove('sibling');
                item.classList.remove('selected');
            });
            links.forEach(function(item, index) {
                item.classList.add('hidden');
                item.classList.remove('sibling');
                item.classList.remove('selected');
            });
        }
    }
    function show_all_elems() {
        if (entities && links) {
            entities.forEach(function(item, index) {
                item.classList.remove('hidden');
                item.classList.remove('sibling');
                item.classList.remove('selected');
            });
            links.forEach(function(item, index) {
                item.classList.remove('hidden');
                item.classList.remove('sibling');
                item.classList.remove('selected');
            });
        }
    }


    return {
        LOADING_STR: 'Идет загрузка...',
        ERROR_STR: 'Ошибка загрузки:\n',
        reload: function() {
            diagram_area.onwheel = zoom_diagram;
            fit_btn.onclick = fit;
            reset_btn.onclick = show_all_elems;
            bind_highlight();
            fit();
            bind_pan();
            bind_keyboard();
        },
        set_codearea_content: function(text) {code_area.innerHTML = text;},
        set_diagramarea_child: function(content) {
            diagram_area.innerHTML = '';
            diagram_area.appendChild(content);
            return diagram_area.childNodes[0];
        },
        set_filename_text: function(text) {filename_label.innerText = text},
        show_error: function(err_msg) {
            filename_label.classList.add("error");
            PlantIDE.Viewer.set_codearea_content(PlantIDE.Viewer.ERROR_STR+err_msg);
            entity_lists.forEach(function(item, index) {item.innerHTML = ''});
            diagram_area.innerHTML = '';
            fit_btn.setAttribute('disabled', true);
            reset_btn.setAttribute('disabled', true);
        },
        create_entity_lists: function(entities_to_num) {
            entity_lists.forEach(function(item, index) {init_entity_list(item, entities_to_num);});
            entity_lists.forEach(assign_entity_list);
        },
        hide_error: function() {
            filename_label.classList.remove("error");
            fit_btn.removeAttribute('disabled');
            reset_btn.removeAttribute('disabled');
        },
    }
})();


/* --- Не реализовано --- */
/*
Сохраняет готовую диаграмму вместе с кодом описания
*/
PlantIDE.Exporter = (function() {})();


/*
Загружает готовую диаграмму вместе с кодом описания
*/
PlantIDE.Importer = (function() {})();


/*
Правка кода
Возвращает новую диаграмму и код описания
*/
PlantIDE.Coder = (function() {})();


/*
Уведомление о поддержке API
*/
if (!window.File || !window.FileReader || !window.FileList || !window.Blob) {
    show_fullpage_msg("Ваш браузер не поддерживает API для работы с файлами. Погуглите.");
}
function show_fullpage_msg(msg_text) {
    var msg = document.createElement("p");
    msg.appendChild(document.createTextNode(msg_text));

    var msg_wrapper = document.createElement("div");
    msg_wrapper.appendChild(msg);
    msg_wrapper.classList.add("fullpage-msg");

    document.body.appendChild(msg_wrapper);
}


/*
Точка входа
*/
PlantIDE.start();