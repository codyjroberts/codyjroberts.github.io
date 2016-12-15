// Inspiration, guidance and libraries
// Tooltips: http://bl.ocks.org/d3noob/a22c42db65eb00d4e369
// Modal: http://materializecss.com/modals.html
// Force Bubble Charts: http://vallandingham.me/bubble_charts_in_js.html

d3.json('./data.json', (error, data) => {
  if (error) throw error;

  drawViz(data);
});

function drawViz(data) {
  const width = window.innerWidth,
        height = window.innerHeight,
        center = {'x': width/2, 'y': height/2},
        categories = {
          'Meat':      '#D90000',
          'Vegetable': '#60891A',
          'Dairy':     '#FFD808',
          'Dry':       '#FFF0A5',
          'Seafood':   '#04756F',
          'Fruit':     '#2E0927'
        },
        dayCenters = {
          'Monday':    {'x':     (width / 4), 'y':     (height / 3)},
          'Tuesday':   {'x': 2 * (width / 4), 'y':     (height / 3)},
          'Wednesday': {'x': 3 * (width / 4), 'y':     (height / 3)},
          'Thursday':  {'x':     (width / 5), 'y': 2 * (height / 3)},
          'Friday':    {'x': 2 * (width / 5), 'y': 2 * (height / 3)},
          'Saturday':  {'x': 3 * (width / 5), 'y': 2 * (height / 3)},
          'Sunday':    {'x': 4 * (width / 5), 'y': 2 * (height / 3)}
        },
        days = d3.keys(dayCenters);

  let nodes    = [],
      allnodes = [];

  let tooltip = d3.select('body')
    .append('div')
    .attr('class', 'tooltip')
    .style('opacity', 0);

  let nested = d3.nest()
    .key(d => d.day)
    .key(d => d.category)
    .rollup(d => d.length)
    .entries(data.items);

  data.items.forEach((d, idx) => {
    let i      = days.indexOf(d.day),
        radius = 1 * 10,
        entry  = {group: i, r: radius, category: d.category, item: d.item, id: idx}

    allnodes.push(entry);
  });

  nested.forEach((d, idx) => {
    d.values.forEach(c => {
      let i      = days.indexOf(d.key),
          radius = c.value * 6,
          entry  = {group: i, r: radius, category: c.key, id: idx};

      nodes.push(entry);
    })
  });

  let svg = d3.select('body')
    .style('background', '#eee')
    .append('svg')
    .attr('height', height)
    .attr('width', width)
    .append('g');

  // Add text items
  addText('viztitle', center.x, height * .1, 'Food Variety');

  addText('total', center.x - 50, height * .15, 'Total View', () => {
    d3.select('svg g').selectAll('circle').remove();
    d3.select('svg g').selectAll('text').remove();
    displayAll(allnodes);
  });

  addText('week', center.x + 50, height * .15, 'Week View', () => {
    d3.select('svg g').selectAll('circle').remove();
    displayWeek(nodes);
  });

  addText('abt', center.x, height * .9, 'About', () => {
    $('#about').openModal();
  });

  addText('showdata', center.x, height * .95, 'Data', () => {
    d3.select('body').append('div')
      .attr('id', 'data')
      .attr('class', 'modal bottom-sheet')
      .append('pre')
      .attr('id', 'json')
      .attr('class', 'modal-content');

    document.getElementById('json').innerHTML = JSON.stringify(data, null, 2);

    $('#data').openModal();
  });

  // Default view
  displayAll(allnodes);

  function displayAll(elements) {
    let sim = d3.forceSimulation()
      .force('collide', d3.forceCollide(35))
      .force('center', d3.forceCenter(center.x, center.y));

    let node = svg
      .selectAll('circle')
      .data(elements, d => d)
      .enter()
      .append('g');

    svg.selectAll('circle')
      .data(elements, d => d)
      .exit()
      .remove();

    let circles = node.append('circle')
      .attr('id', d => d.id)
      .attr('r', d => d.r * 2)
      .attr('fill', d => categories[d.category])
      .attr('stroke', '#666')
      .attr('data', d => d)
      .on('mouseover', d => {
        fadeOpacity(d, 0.25);
        fadeTooltip(d, 'in', 1);
      })
      .on('mouseout', d => {
        fadeOpacity(d, 1);
        fadeTooltip(d, 'out');
      });

    sim.nodes(elements)
      .on('tick', () => {
        circles
          .attr('cx', d => d.x)
          .attr('cy', d => d.y);
      });
  }

  function displayWeek(elements) {
    let sim = d3.forceSimulation().force('collide', collide)

    let node = svg
      .selectAll('circle')
      .data(elements, d => d)
      .enter()
      .append('g');

    svg.selectAll('circle')
      .data(elements, d => d)
      .exit()
      .remove();

    node.append('circle')
      .attr('id', d => d.id)
      .attr('r', d => d.r)
      .attr('fill', d => categories[d.category])
      .attr('stroke', '#666')
      .attr('opacity', 0.75)
      .attr('data', d => d)
      .on('mouseover', d => {
        fadeOpacity(d, 0.25);
        fadeTooltip(d, 'in', 1);
      })
      .on('mouseout', d => {
        fadeOpacity(d, 1);
        fadeTooltip(d, 'out');
      });

    sim.nodes(elements)
      .on('tick', () => {
        node
          .each(weekView(sim.alpha()))
          .attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
      });

    svg.selectAll('text')
      .data(days)
      .enter()
      .append('text')
      .attr('x', d => dayCenters[d].x)
      .attr('y', d => dayCenters[d].y + 120)
      .attr('class', 'label')
      .attr('opacity', 0)
      .text(d => d)
      .transition()
      .duration(2000)
      .attr('opacity', 1);

    function weekView(alpha) {
      return (d) => {
        var target = dayCenters[days[d.group]];
        d.x += (target.x - d.x) * 0.25 * alpha;
        d.y += (target.y - d.y) * 0.25 * alpha;
      }
    }

    function collide(alpha) {
      const padding = 6, // separation between same-color circles
        groupPadding = 20, // separation between different-color circles
        maxRadius = window.innerHeight * .0275;

      let quadtree = d3.quadtree()
        .x((d) => d.x)
        .y((d) => d.y)
        .addAll(elements);

      elements.forEach((d) => {
        let r = d.r + maxRadius + Math.max(padding, groupPadding),
          nx1 = d.x - r,
          nx2 = d.x + r,
          ny1 = d.y - r,
          ny2 = d.y + r;
        quadtree.visit((quad, x1, y1, x2, y2) => {

          if (quad.data && (quad.data !== d)) {
            let x = d.x - quad.data.x,
              y = d.y - quad.data.y,
              l = Math.sqrt(x * x + y * y),
              r = d.r + quad.data.r + (d.group === quad.data.group ? padding : groupPadding);
            if (l < r) {
              l = (l - r) / l * alpha;
              d.x -= x *= l;
              d.y -= y *= l;
              quad.data.x += x;
              quad.data.y += y;
            }
          }
          return x1 > nx2 || x2 < nx1 || y1 > ny2 || y2 < ny1;
        });
      });
    }
  }

  // Helper functions
  function addText(id, x, y, text, click = () => {}) {
    d3.select('svg')
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('id', id)
      .attr('x', x)
      .attr('y', y)
      .text(text)
      .on('click', click);
  }

  function fadeOpacity(element, opacity) {
    d3.selectAll('circle')
      .filter(f => f.category !== element.category)
      .transition()
      .duration(300)
      .attr('opacity', opacity);
  }

  function fadeTooltip(element, transition, opacity = 0) {
    let brk = '</br>',
        cat = d => 'Category: ' + d.category,
        num = d => 'Number: ' + (d.r / 6),
        itm = d => 'Item: ' + d.item,
        tip = d => {
          if (d.item)
            return cat(d) + brk + itm(d);
          else
            return cat(d) + brk + num(d);
        }

    tooltip
      .transition()
      .duration(300)
      .style('opacity', opacity)

    if (transition === 'in') {
      tooltip
        .html(tip(element))
        .style('left', (d3.event.pageX + 40) + 'px')
        .style('top', d3.event.pageY + 'px')
    }
  }

  $('#about').delay(5000).css('visibility', 'visible').openModal();
}
