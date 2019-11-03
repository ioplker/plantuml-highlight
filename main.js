/*
Корень
Связывает дочерние объекты
*/
var PlantIDE = {
    scheme_type: 'entity',
    show_scheme_dialog: function() {
        /*
        Отображение окна с выбором типа диаграммы
        Устанавливает доступные горячие клавиши
        Влияет на выбор применяемого парсера
        */
        if (!PlantIDE.Viewer.is_modal_open()) {
            PlantIDE.Viewer.set_modal_open(true);

            let scheme_type_dialog = document.querySelector('.fullpage-msg.scheme-type');
            scheme_type_dialog.classList.add('active');

            let entity_scheme_type_radio = document.getElementById('entity-scheme_radio');
            let precedence_scheme_type_radio = document.getElementById('precedence-scheme_radio');
            document.onkeydown = function(event) {
                // console.log(event.which);
                switch (event.which) {
                    case 27:  // Escape
                        PlantIDE.hide_scheme_dialog();
                        break;
                    case 49:  // 1
                        entity_scheme_type_radio.click();
                        break;
                    case 50:  // 2
                        precedence_scheme_type_radio.click();
                        break;
                    default:
                        break;
                }
            }
        }
    },
    hide_scheme_dialog: function() {
        /*
        Скрытие окна с выбором типа диаграммы
        Устанавливает доступные горячие клавиши
        */
        PlantIDE.Viewer.set_modal_open(false);

        let scheme_type_dialog = document.querySelector('.fullpage-msg.scheme-type');
        scheme_type_dialog.classList.remove('active');
        PlantIDE.Viewer.bind_keyboard();
    },
    show_filename: function(event) {
        /*
        Отображение имени файла или ошибки
        */
        var selected_file = PlantIDE.Loader.read_file(event);
        if (selected_file.is_error) {
            PlantIDE.Viewer.show_error();
        } else {
            PlantIDE.Viewer.set_filename_text(selected_file.content);
        }
    },
    start: function() {
        /*
        Точка входа
        Устанавливает необходимые колбаски
        Всмысле коллбеки, могу я пошутить в своём коде? U_U
        */
        this.show_error = PlantIDE.Viewer.show_error;
        this.hide_error = PlantIDE.Viewer.hide_error;
        this.bind_file_selection();
        this.bind_reader();
        PlantIDE.Viewer.bind_keyboard();
    },
    bind_file_selection: function() {
        /*
        Коллбеки на загрузку файла схемы
        */
        let file_input = document.getElementsByClassName('file')[0];
        let svg_btn = document.getElementsByClassName('svg-btn')[0];
        let entity_scheme_type_radio = document.getElementById('entity-scheme_radio');
        let precedence_scheme_type_radio = document.getElementById('precedence-scheme_radio');
        entity_scheme_type_radio.onclick = function () {
            PlantIDE.scheme_type = 'entity';
            file_input.click();
            PlantIDE.hide_scheme_dialog();
        }
        precedence_scheme_type_radio.onclick = function () {
            PlantIDE.scheme_type = 'precedence';
            file_input.click();
            PlantIDE.hide_scheme_dialog();
        }

        file_input.addEventListener('change', PlantIDE.show_filename, false);
        svg_btn.onclick = function(event) {PlantIDE.show_scheme_dialog();};
    },
    bind_reader: function() {
        /*
        Коллбеки на чтение файла схемы
        */
        PlantIDE.Loader.reader.onloadstart = function(event) {
            PlantIDE.Viewer.set_codearea_content(PlantIDE.Viewer.LOADING_STR);
        };
        PlantIDE.Loader.reader.onloadend = function(event) {
            PlantIDE.bootstrap(event);
        };
        PlantIDE.Loader.reader.onerror = this.show_error;
    },
    bootstrap: function(event) {
        /*
        Отправка svg схемы на парсинг
        Отображает схему или ошибку
        */
        raw_text = event.target.result;
        var loaded_diagram = PlantIDE.Loader.get_diagram_code(raw_text);
        var loaded_svg = PlantIDE.Loader.get_svg(raw_text);

        if (loaded_diagram.is_error || loaded_svg.is_error) {
            PlantIDE.show_error();
        } else {
            diagram_code = loaded_diagram.content;
            svg_text = loaded_svg.content;
            var parsed_svg = PlantIDE.Parser.parse_diagram(PlantIDE.scheme_type, diagram_code, svg_text);

            if (parsed_svg.is_error) {
                PlantIDE.show_error(parsed_svg.err_msg);
            } else {
                PlantIDE.Viewer.set_codearea_content(diagram_code);
                diagram_svg = PlantIDE.Viewer.set_diagramarea_child(parsed_svg.content);

                // console.log(PlantIDE.Parser.get_nodes_to_num());

                PlantIDE.Viewer.create_node_lists(PlantIDE.Parser.get_nodes_to_num());
                PlantIDE.Viewer.reload();
                PlantIDE.hide_error();
            }
        }
    }
};


/*
Загружает файл диаграммы
Возвращает текст описания и SVG
*/
PlantIDE.Loader = (function() {
    let FILENAME_LENGTH = 30;
    var current_file, diagram_code, svg_text, diagram_svg;


    return {
        reader: new FileReader(),
        read_file: function(event) {
            /*
            Чтение файла схемы
            */
            current_file = event.target.files[0];
            var output = [];

            size = ((current_file.size/1024).toFixed(2) + ' Кб') || '';
            upd_date = new Date(current_file.lastModified);
            upd_date = current_file.lastModified ? (', ' + upd_date.toLocaleTimeString() + ' - ' + upd_date.toLocaleDateString()) : ''

            var filename = current_file.name;
            var file_extention = filename.match(/\.[0-9a-z]+$/i)[0];
            if ((filename.length-file_extention.length) > FILENAME_LENGTH) {
                filename = filename.slice(0, FILENAME_LENGTH) + '..' + file_extention;
            }

            output.push(filename + ' (' + size + upd_date +')');

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
            /*
            Извлечение описания схемы из исходного файла
            */
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
            /*
            Извлечение svg-кода схемы из исходного файла
            */
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
Основной парсер (менеджер)
Парсит и модифицирует SVG
Возвращает новый объект SVG
*/
PlantIDE.Parser = (function() {
    function parse_entity_scheme(diagram_code, svg_text) {
        /*
        Парсинг диаграммы сущностей (классов)
        */
        return PlantIDE.Parser.EntityParser.parse_diagram(diagram_code, svg_text);
    }
    function parse_precedence_scheme(diagram_code, svg_text) {
        /*
        Парсинг диаграммы прецедентов
        */
        return PlantIDE.Parser.PrecedenceParser.parse_diagram(diagram_code, svg_text);
    }
    function return_content(content) {
        /*
        Возврат объекта-ответа
        */
        return {
            is_error: false,
            content: content
        }
    }
    function return_error(error) {
        /*
        Возврат объекта-ошибки
        */
        return {
            is_error: true,
            err_msg: error
        }
    }


    return {
        return_content: return_content,
        return_error: return_error,
        parse_diagram: function(scheme_type, diagram_code, svg_text) {
            /*
            Перенаправление на нужный парсер
            */
            // console.log(scheme_type);
            svg_text = svg_text.replace(/<\!--reverse link/g, '<!--link');
            switch (scheme_type) {
                case "entity":
                    return parse_entity_scheme(diagram_code, svg_text);
                    break;
                case "precedence":
                    return parse_precedence_scheme(diagram_code, svg_text);
                    break;
                default:
                    return return_error("Выбран неверный тип диаграммы");
                    break;
            }
        },
        get_nodes_to_num: function () {
            /*
            Получение списка нод по числам
            */
            switch (PlantIDE.scheme_type){
                case 'entity':
                    return PlantIDE.Parser.EntityParser.get_nodes_to_num();
                    break;
                case 'precedence':
                    return PlantIDE.Parser.PrecedenceParser.get_nodes_to_num();
                    break;
                default:
                    break;
            }
        },
        get_svg_headers: function(svg_text) {
            /*
            Получение заголовков для корректного формирования svg
            */
            return svg_text.match(/<svg.*?<\/defs>/g);
        },
        make_valid_svg: function(svg_headers, svg_text, tooltip='') {
            /*
            Генерация корректного svg из заголовков и передаваемого контента
            */
            if (tooltip.length > 0) {
                tooltip = '<text class="tooltip" style="display: none;">'+tooltip+'</text>';
            }
            return new DOMParser().parseFromString(svg_headers+'<g>'+svg_text+tooltip+'</g></svg>', 'application/xml');
        }
    }
})();


/*
Парсер диаграмм сущностей
*/
PlantIDE.Parser.EntityParser = (function() {
    var num_to_nodes = Object();
    var nodes_to_num = Object();
    let svg_headers;

    function get_svg_headers(svg_text) {
        /*
        Получение заголовков для корректного формирования svg
        Используется метод основного парсера
        */
        return PlantIDE.Parser.get_svg_headers(svg_text);
    }
    function make_valid_svg(svg_text, tooltip='') {
        /*
        Генерация корректного svg из заголовков и передаваемого контента
        Используется метод основного парсера
        */
        return PlantIDE.Parser.make_valid_svg(svg_headers, svg_text, tooltip);
    }
    function get_node_lists(diagram_code) {
        /*
        Получение списков нод по номерам и номеров по нодам
        */
        var reg = new RegExp('(class|entity|enum) [^\{]*', 'g');
        num_to_nodes = Object();
        nodes_to_num = Object();

        diagram_code.match(reg).forEach(function(item, index) {
            var node = item.replace(/class|entity|enum|\s/g, '').replace(/<<.*?>>/g, '');     // последний replace удаляет указание стереотипа
            num_to_nodes['n'+index.toString()] = node;
            nodes_to_num[node] = 'n'+index.toString();
        });

        return [nodes_to_num, num_to_nodes];
    }
    function assign_node_nums(nodes_to_num, svg_text) {
        /*
        Привязка номеров нод к самим нодам через класс
        Позволяет управлять отображением ноды через класс
        */
        var raw_reg = new RegExp('--class.*?<!', 'g');
        var name_reg = new RegExp('--class.*?-->', 'g');
        var name, node, tooltip;
        var nodes_wrapper = make_valid_svg('');
        nodes_wrapper.children[0].children[1].classList.add('nodes_wrapper');

        svg_text.match(raw_reg).forEach(function(item, index) {
            name = item.match(name_reg)[0].replace(/--class |-->/g, '');

            node = make_valid_svg(item.replace(/(--class.*-->)|<!/g, ''), name).children[0].children[1];
            node.classList.add("node");
            node.dataset.num = nodes_to_num[name].toString();

            nodes_wrapper.children[0].children[1].appendChild(node);
        });

        return nodes_wrapper;
    }
    function assign_link_nums(nodes_to_num, svg_text) {
        /*
        Привязка номеров нод к нодам связей через класс
        Позволяет управлять отображением связи через класс
        */
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

            link = make_valid_svg(item.replace(/(--link.*-->)|<!/g, '')).children[0].children[1];
            link.classList.add("link");

            if (nodes_to_num.hasOwnProperty(from_name) && nodes_to_num.hasOwnProperty(from_name)) {
                link.classList.add(nodes_to_num[from_name]);
                link.classList.add(nodes_to_num[to_name]);
                links_wrapper.children[0].children[1].appendChild(link);
            }
        });

        return links_wrapper;
    }
    function return_content(content) {
        /*
        Возврат объекта-ответа
        Выполняется метод основного парсера
        */
        return PlantIDE.Parser.return_content(content);
    }
    function return_error(error) {
        /*
        Возврат объекта-ошибки
        Выполняется метод основного парсера
        */
        return PlantIDE.Parser.return_error(error);
    }


    return {
        nodes_to_num: nodes_to_num,
        num_to_nodes: num_to_nodes,
        parse_diagram: function(diagram_code, svg_text) {
            /*
            Непосредственный парсинг схемы
            */
            try {
                // 1. Получить необходимые заголовки для парсинга DOMParser
                svg_headers = get_svg_headers(svg_text);

                // 2. Узнать имена нод и сопоставить с числами (от нуля) - парсинг текста описания диаграммы
                [nodes_to_num, num_to_nodes] = get_node_lists(diagram_code);

                // 3. Добавить нодам числа их имен - парсинг текста svg
                var nodes_wrapper = assign_node_nums(nodes_to_num, svg_text);

                // 4. Сопоставить связям числа имен нод - парсинг текста svg
                var links_wrapper = assign_link_nums(nodes_to_num, svg_text);

                // 5. Объединить обертки нод и связей
                diagram_svg = nodes_wrapper.children[0];
                diagram_svg.appendChild(links_wrapper.children[0].children[1]);

                return return_content(diagram_svg);
            }
            catch (error) {
                console.log(error);
                return return_error(error);
            }
        },
        get_nodes_to_num: function() {
            /*
            Получение списка номеров по нодам
            */
            return nodes_to_num;
        }
    }
})();


/*
Парсер диаграмм прецедентов
*/
PlantIDE.Parser.PrecedenceParser = (function() {
    var num_to_nodes = Object();
    var nodes_to_num = Object();
    let svg_headers;

    function get_svg_headers(svg_text) {
        /*
        Получение заголовков для корректного формирования svg
        Используется метод основного парсера
        */
        return PlantIDE.Parser.get_svg_headers(svg_text);
    }
    function make_valid_svg(svg_text, tooltip='') {
        /*
        Генерация корректного svg из заголовков и передаваемого контента
        Используется метод основного парсера
        */
        return PlantIDE.Parser.make_valid_svg(svg_headers, svg_text, tooltip);
    }
    function get_node_lists(svg_text, diagram_code) {
        /*
        Получение списков нод по номерам и номеров по нодам
        */
        var common_index = 0;

        // акторы
        var actor_raw_reg = new RegExp('--entity.*?<!', 'g');
        var name;

        svg_text.match(actor_raw_reg).forEach(function(item, index) {
            name = item.replace(/--entity |(-->.*)/g, '');
            num_to_nodes['n'+common_index.toString()] = name;
            nodes_to_num[name] = 'n'+common_index.toString();
            common_index += 1;
        });

        // прецеденты
        var precedence_raw_reg = new RegExp('\(.*\).* as \(.*\)', 'g');
        diagram_code.match(precedence_raw_reg).forEach(function(item, index) {
            name = item.replace(/\s*\(.* as \(|\)/g, '');
            num_to_nodes['n'+common_index.toString()] = name;
            nodes_to_num[name] = 'n'+common_index.toString();
            common_index += 1;
        });

        return [nodes_to_num, num_to_nodes];
    }
    function assign_node_nums(nodes_to_num, svg_text) {
        /*
        Привязка номеров нод к самим нодам через класс
        Позволяет управлять отображением ноды через класс
        */
        // акторы
        var actor_raw_reg = new RegExp('--entity.*?<!', 'g');
        var actor_name_reg = new RegExp('--entity.*?-->', 'g');
        var name;
        var nodes_wrapper = make_valid_svg('');
        nodes_wrapper.children[0].children[1].classList.add('nodes_wrapper');
        var node;

        svg_text.match(actor_raw_reg).forEach(function(item, index) {
            name = item.match(actor_name_reg)[0].replace(/--entity |-->/g, '');

            node = make_valid_svg(item.replace(/(--entity.*-->)|<!/g, ''), name).children[0].children[1];
            node.classList.add("node");
            node.dataset.num = nodes_to_num[name].toString();

            nodes_wrapper.children[0].children[1].appendChild(node);
        });

        // прецеденты
        var precedence_raw_reg = new RegExp('ipse.*?<ell', 'g');
        var raw_without_actors = svg_text.match(RegExp('<ellipse.*?<!--entity', 'g'))[0].replace(/<!--entity.*/g, '<ell');
        var node_svg;

        raw_without_actors.match(precedence_raw_reg).forEach(function(item, index) {
            node_svg = item.replace(/<ell/g, '').replace(/ipse/g, '<ellipse').replace(/<!--.*/g, '');

            name = '';
            node_svg.match(/<text.*?<\/text>/g).forEach(function(item, index) {
                var name_part = item.replace(/<text.*?>|<\/text>|«.*?»/g, '').replace(/\s/g, '_');
                name += name_part.length > 0 ? name_part+'_' : '';
            });
            name = name.slice(0, -1);

            node = make_valid_svg(node_svg, name).children[0].children[1];
            node.classList.add("node");
            node.dataset.num = nodes_to_num[name].toString();

            nodes_wrapper.children[0].children[1].appendChild(node);
        });

        return nodes_wrapper;
    }
    function assign_link_nums(nodes_to_num, svg_text) {
        /*
        Привязка номеров нод к нодам связей через класс
        Позволяет управлять отображением связи через класс
        */
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

            link = make_valid_svg(item.replace(/(--link.*-->)|<!/g, '')).children[0].children[1];
            link.classList.add("link");

            if (nodes_to_num.hasOwnProperty(from_name) && nodes_to_num.hasOwnProperty(from_name)) {
                link.classList.add(nodes_to_num[from_name]);
                link.classList.add(nodes_to_num[to_name]);
                links_wrapper.children[0].children[1].appendChild(link);
            }
        });

        return links_wrapper;
    }
    function return_content(content) {
        /*
        Возврат объекта-ответа
        Выполняется метод основного парсера
        */
        return PlantIDE.Parser.return_content(content);
    }
    function return_error(error) {
        /*
        Возврат объекта-ошибки
        Выполняется метод основного парсера
        */
        return PlantIDE.Parser.return_error(error);
    }


    return {
        nodes_to_num: nodes_to_num,
        num_to_nodes: num_to_nodes,
        parse_diagram: function(diagram_code, svg_text) {
            /*
            Перенаправление на нужный парсер
            */
            try {
                // 1. Получить необходимые заголовки для парсинга DOMParser
                svg_headers = get_svg_headers(svg_text);

                // 2. Узнать имена нод (акторов и прецедентов) и сопоставить с числами (от нуля) - парсинг текста svg
                [nodes_to_num, num_to_nodes] = get_node_lists(svg_text, diagram_code);

                // 3. Добавить нодам числа их имен - парсинг текста svg
                var nodes_wrapper = assign_node_nums(nodes_to_num, svg_text);

                // 4. Сопоставить связям числа имен нод - парсинг текста svg
                var links_wrapper = assign_link_nums(nodes_to_num, svg_text);

                // 5. Объединить обертки нод и связей
                diagram_svg = nodes_wrapper.children[0];
                diagram_svg.appendChild(links_wrapper.children[0].children[1]);

                return return_content(diagram_svg);
            }
            catch (error) {
                console.log(error);
                return return_error(error);
            }
        },
        get_nodes_to_num: function() {
            /*
            Получение списка номеров по нодам
            */
            return nodes_to_num;
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
    var some_modal_open = false;

    let code_area = document.getElementsByClassName('code')[0];
    let diagram_area = document.getElementsByClassName('diagram')[0];
    let filename_label = document.getElementsByClassName('file-name')[0];
    let fit_btn = document.getElementsByClassName('fit')[0];
    let reset_btn = document.getElementsByClassName('reset')[0];
    let node_lists = Array.from(document.getElementsByClassName('node-list')).splice(0,2);
    let nodes, links;

    function init_node_list(list, nodes_to_num) {
        /*
        Инициализация списка отображения нод
        */
        list.innerHTML = '';
        for (const [node, num] of Object.entries(nodes_to_num)) {
            var list_item = document.createElement("li");
            list_item.innerHTML = node;
            list.appendChild(list_item);
            list_item.dataset.num = num;
        }
    }
    function assign_node_list(list) {
        /*
        Привязка номеров нод к элементам списка их отображения
        */
        Array.from(list.children).forEach(function(list_item, index) {
            var classes = Array.from(document.querySelector('.node[data-num="'+list_item.dataset.num+'"]').classList);
            list_item.classList.add('node');
            classes.forEach(function(class_item, index) {
                list_item.classList.add(class_item);
            });
        });
    }
    function zoom_diagram(event) {
        /*
        Зум диаграммы
        */
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
        /*
        Приближение диаграммы
        Завязано на горячие клавиши
        */
        scale_factor *= SCALE_STEP;
        set_svg_scale(scale_factor);
    }
    function zoom_out() {
        /*
        Отдаление диаграммы
        Завязано на горячие клавиши
        */
        scale_factor /= SCALE_STEP;
        set_svg_scale(scale_factor);
    }
    function set_svg_scale(scale_factor) {
        /*
        Непосредственный механизм изменения размера диаграммы
        Используется при зуме
        */
        diagram_svg.style.transform = 'scale('+scale_factor+')';
    }
    function get_svg_coords() {
        /*
        Получение координат диаграммы
        */
        return {
            x: parseInt(diagram_svg.style.left),
            y: parseInt(diagram_svg.style.top)
        }
    }
    function set_svg_coords(coords) {
        /*
        Непосредственный механизм установки координат диаграммы
        */
        diagram_svg.style.left = coords.x + 'px';
        diagram_svg.style.top = coords.y + 'px';
        // console.log(coords);
    }
    function move_left() {
        /*
        Сдвиг вида влево
        Сама диаграмма сдвигается вправо
        */
        var step = diagram_svg.getBoundingClientRect().width * 0.05;
        var origin_coords = get_svg_coords();
        origin_coords.x += step;
        set_svg_coords(origin_coords);
    }
    function move_right() {
        /*
        Сдвиг вида вправо
        Сама диаграмма сдвигается влево
        */
        var step = diagram_svg.getBoundingClientRect().width * 0.05;
        var origin_coords = get_svg_coords();
        origin_coords.x -= step;
        set_svg_coords(origin_coords);
    }
    function move_up() {
        /*
        Сдвиг вида вверх
        Сама диаграмма сдвигается вниз
        */
        var step = diagram_svg.getBoundingClientRect().height * 0.05;
        var origin_coords = get_svg_coords();
        origin_coords.y += step;
        set_svg_coords(origin_coords);
    }
    function move_down() {
        /*
        Сдвиг вида вниз
        Сама диаграмма сдвигается вверх
        */
        var step = diagram_svg.getBoundingClientRect().height * 0.05;
        var origin_coords = get_svg_coords();
        origin_coords.y -= step;
        set_svg_coords(origin_coords);
    }
    function toggle_help() {
        /*
        Включение / выключение отображения окна справки
        */
        var help_dialog = document.querySelector('.fullpage-msg.controls-help');
        set_modal_open(help_dialog.classList.toggle('active'));
    }
    function toggle_zen() {
        /*
        Включение / выключение режима "Дзен"
        */
        document.body.classList.toggle('zen');
    }
    function set_modal_open(is_open) {
        some_modal_open = is_open;
    }
    function is_modal_open() {
        return some_modal_open;
    }
    function get_cursor_coords(event) {
        /*
        Получение абсолютных координат курсора (в координатной сетке всей страницы)
        */
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
        /*
        Расчет координат диаграммы
        Используется для паннинга
        */
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
        /*
        Вмещение диаграммы во все окно просмотра
        Подгоняет максимальный размер диаграммы и перемещает её в левый верхний угол
        */
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
        /*
        Привязка горячих клавиш
        Привязка разрушающая - предыдущие привязки не сохраняются
        Клавиши управления диаграммой привязываются, если диаграмма загружена
        */
        if (typeof diagram_svg !== "undefined") {
            document.onkeydown = function(event) {
                // console.log(event.which);
                switch (event.which) {
                    case 37:  // arrow left
                        move_left();
                        event.preventDefault();
                        break;
                    case 38:  // arrow up
                        move_up();
                        event.preventDefault();
                        break;
                    case 39:  // arrow right
                        move_right();
                        event.preventDefault();
                        break;
                    case 40:  // arrow down
                        move_down();
                        event.preventDefault();
                        break;
                    case 65:  // A
                        move_left();
                        break;
                    case 68:  // D
                        move_right();
                        break;
                    case 69:  // E
                        zoom_in();
                        break;
                    case 70:  // F
                        fit();
                        break;
                    case 72:  // H
                        toggle_help();
                        break;
                    case 79:  // O
                        PlantIDE.show_scheme_dialog();
                        break;
                    case 81:  // Q
                        zoom_out();
                        break;
                    case 82:  // R
                        show_all_elems();
                        break;
                    case 87:  // W
                        move_up();
                        break;
                    case 83:  // S
                        move_down();
                        break;
                    case 96:  // numpad 0
                        show_all_elems();
                        break;
                    case 90:  // Z
                        toggle_zen();
                        break;
                    case 97:  // numpad 1
                        move_left();
                        move_down();
                        break;
                    case 98:  // numpad 2
                        move_down();
                        break;
                    case 99:  // numpad 3
                        move_right();
                        move_down();
                        break;
                    case 100:  // numpad 4
                        move_left();
                        break;
                    case 101:  // numpad 5
                        fit();
                        break;
                    case 102:  // numpad 6
                        move_right();
                        break;
                    case 103:  // numpad 7
                        move_left();
                        move_up();
                        break;
                    case 105:  // numpad 9
                        move_up();
                        move_right();
                        break;
                    case 104:  // numpad 8
                        move_up();
                        break;
                    case 107:  // numpad +
                        zoom_in();
                        break;
                    case 109:  // numpad -
                        zoom_out();
                        break;
                    default:
                        break;
                }
            }
        } else {
            document.onkeydown = function(event) {
                // console.log(event.which);
                switch (event.which) {
                    case 72:  // H
                        toggle_help();
                        break;
                    case 79:  // O
                        PlantIDE.show_scheme_dialog();
                        break;
                    case 90:  // Z
                        toggle_zen();
                        break;
                    default:
                        break;
                }
            }
        }
    }
    function bind_pan() {
        /*
        Привязка поведения при паннинге
        */
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
                    /*
                    Начало паннинга
                    Устанавливает флаг паннинга
                    */
                    last_cursor_coords = get_cursor_coords();
                    is_panning = true;
                },
                stop_pan: function (event) {
                    /*
                    Остановка паннинга
                    Устанавливает флаг паннинга
                    */
                    is_panning = false;
                },
                while_pan: function (event) {
                    /*
                    Непосредственный паннинг
                    У диаграммы меняются координаты, если установлен флаг паннинга
                    */
                    if (is_panning) {
                        new_cursor_coords = get_cursor_coords();
                        moveto_coords = get_svg_coords();
                        moveto_coords = {
                            x: (moveto_coords.x - (last_cursor_coords.x - new_cursor_coords.x)),
                            y: (moveto_coords.y - (last_cursor_coords.y - new_cursor_coords.y))
                        };
                        set_svg_coords(moveto_coords);
                        last_cursor_coords = get_cursor_coords();
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
        /*
        Привязка подсветки нод
        Подсветка работает на css-классах
        */
        nodes = Array.from(document.getElementsByClassName('node'));
        links = Array.from(document.getElementsByClassName('link'));
        add_links_to_main(links);

        nodes.forEach(function(item, index) {
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
    function add_links_to_main(links) {
        /*
        Добавление номеров нодам в соответствии со связями
        Связь имеет два конца: К_1 и К_2
        Всем нодам с номером К_1 добавляется класс К_2
        Всем нодам с номером К_2 добавляется класс К_1
        */
        var from_num, to_num;
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
                Array.from(document.querySelectorAll('[data-num="'+num+'"]')).forEach(function(node, index) {
                    links_dict[num].forEach(function(item, index) {
                        node.classList.add(item);
                    });
                });
            }
        }
    }
    function hide_all_elems() {
        /*
        Скрытие всех нод и связей
        Используется, чтобы потом отобразить только выделенную ноду и её соседей
        */
        if (nodes && links) {
            nodes.forEach(function(item, index) {
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
        /*
        Отображение всех нод и связей
        */
        if (nodes && links) {
            nodes.forEach(function(item, index) {
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
    function bind_tooltips() {
        /*
        Обработка вспомогательных надписей у нод
        Ставит коллбек на отоброжение нужной надписи при наведении курсора
        */
        var tooltip_box = document.getElementById('tooltip-box');
        Array.from(document.getElementsByClassName('node')).forEach(function(node, index) {
            var tooltip = node.getElementsByClassName('tooltip')[0];
            node.onmouseover = function(event) {
                var coords = get_cursor_coords(event);
                if (typeof tooltip !== 'undefined') {
                    tooltip_box.innerHTML = tooltip.innerHTML;
                    tooltip_box.style.left = coords.x.toString()+'px';
                    tooltip_box.style.top = (coords.y-40).toString()+'px';
                    tooltip_box.classList.add('active');
                }
            }
            node.onmouseout = function(event) {
                if (typeof tooltip !== 'undefined') {
                    tooltip_box.classList.remove('active');
                    tooltip_box.innerHTML = '';
                }
            }
        })
    }


    return {
        LOADING_STR: 'Идет загрузка...',
        ERROR_STR: 'Ошибка загрузки:\n',
        bind_keyboard: bind_keyboard,
        some_modal_open: some_modal_open,
        reload: function() {
            /*
            Перезагрузка Viewer
            Используется при открытии новой диаграммы
            */
            diagram_area.onwheel = zoom_diagram;
            fit_btn.onclick = fit;
            reset_btn.onclick = show_all_elems;
            bind_highlight();
            fit();
            bind_pan();
            bind_keyboard();
            bind_tooltips();
        },
        set_modal_open: set_modal_open,
        is_modal_open: is_modal_open,
        set_codearea_content: function(text) {
            /*
            Непосредственный механизм отображения контента в окне кода
            */
            code_area.innerHTML = text;
        },
        set_diagramarea_child: function(content) {
            /*
            Установка дочернего элемента для области просмотра диаграммы
            */
            diagram_area.innerHTML = '';
            diagram_area.appendChild(content);
            return diagram_area.childNodes[0];
        },
        set_filename_text: function(text) {
            /*
            Непосредственный механизм отображения имени файла
            */
            filename_label.innerText = text
        },
        show_error: function(err_msg) {
            /*
            Отображение ошибки в окне кода
            */
            filename_label.classList.add("error");
            PlantIDE.Viewer.set_codearea_content(PlantIDE.Viewer.ERROR_STR+err_msg);
            node_lists.forEach(function(item, index) {item.innerHTML = ''});
            diagram_area.innerHTML = '';
            fit_btn.setAttribute('disabled', true);
            reset_btn.setAttribute('disabled', true);
        },
        create_node_lists: function(nodes_to_num) {
            /*
            Создание списков нод
            */
            node_lists.forEach(function(item, index) {init_node_list(item, nodes_to_num);});
            node_lists.forEach(assign_node_list);
        },
        hide_error: function() {
            /*
            Скрытие ошибки в окне кода
            */
            filename_label.classList.remove("error");
            fit_btn.removeAttribute('disabled');
            reset_btn.removeAttribute('disabled');
        },
        show_fullpage_msg_text: function(msg_text) {
            /*
            Отображение модального окна
            */
            var msg = document.createElement("p");
            msg.appendChild(document.createTextNode(msg_text));

            var msg_wrapper = document.createElement("div");
            msg_wrapper.appendChild(msg);
            msg_wrapper.classList.add("fullpage-msg");
            msg_wrapper.classList.add("active");

            document.body.appendChild(msg_wrapper);
            console.log(msg_text);
            console.log(msg_wrapper);
        },
        show_fullpage_msg_html: function(msg_html) {
            /*
            Отображение модального окна
            */
            var msg = document.createElement("div");
            msg.innerHTML = msg_html;

            var msg_wrapper = document.createElement("div");
            msg_wrapper.appendChild(msg);
            msg_wrapper.classList.add("fullpage-msg");
            msg_wrapper.classList.add("active");

            document.body.appendChild(msg_wrapper);
            console.log(msg_html);
            console.log(msg_wrapper);
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
    PlantIDE.Viewer.show_fullpage_msg_text("Ваш браузер не поддерживает API для работы с файлами. Погуглите.");
}


/*
Точка входа
*/
PlantIDE.start();