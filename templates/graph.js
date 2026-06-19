    const graphData = __GRAPH_DATA_JSON__;
    window.__PYTHON_PROJECT_INSPECTOR_DATA__ = graphData;
    const lineCategories = graphData.line_categories || [];
    const lineCategoryKeys = lineCategories.map((category) => category.key);
    const brightnessCriteria = [
      { key: "cyclomatic_median", label: "Cyclomatic median", default: true, weight: 1.0 },
      { key: "cognitive_median", label: "Cognitive median", default: true, weight: 1.3 },
      { key: "jones_median", label: "Jones median", default: true, weight: 1.0 },
      { key: "method_count", label: "Method count", default: true, weight: 1.0 },
      { key: "total_lines", label: "Code lines", default: true, weight: 0.4 },
      { key: "python_file_count", label: "Python file count", default: true, weight: 1.0 },
    ];
    const neutralNodeRadius = 50;
    const minNodeRadius = 34;
    const maxNodeRadius = 86;
    const selectionDragThreshold = 4;
    const treemapWidth = 1600;
    const treemapHeight = 560;
    const treemapTilePadding = 1;
    const treemapMinTextWidth = 60;
    const treemapMinTextHeight = 28;
    const treemapPalette = [
      "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
      "#edc949", "#af7aa1", "#ff9da7", "#9c755f", "#bab0ab",
    ];
    const treemapRootColor = "#6b7280";
    const treemapFallbackColor = "#9ca3af";
    const reportState = window.__PYTHON_PROJECT_INSPECTOR_STATE__ || {
      selectedModuleId: null,
      selectedFilePath: null,
      selectedLineCategoryKeys: lineCategories.filter((category) => category.default).map((category) => category.key),
      selectedBrightnessCriterionKeys: brightnessCriteria.filter((criterion) => criterion.default).map((criterion) => criterion.key),
      visibleLinesTotal: 0,
    };
    window.__PYTHON_PROJECT_INSPECTOR_STATE__ = reportState;

    function emitReportState() {
      window.dispatchEvent(
        new CustomEvent("coupling-report-state", {
          detail: {
            selectedModuleId: reportState.selectedModuleId,
            selectedFilePath: reportState.selectedFilePath,
            selectedLineCategoryKeys: [...reportState.selectedLineCategoryKeys],
            selectedBrightnessCriterionKeys: [...reportState.selectedBrightnessCriterionKeys],
            visibleLinesTotal: reportState.visibleLinesTotal,
          },
        }),
      );
    }

    window.__PYTHON_PROJECT_INSPECTOR_ACTIONS__ = {
      setLineCategoryKeys(keys) {
        reportState.selectedLineCategoryKeys = [...keys];
        applyLineCategorySelection();
      },
      setBrightnessCriterionKeys(keys) {
        reportState.selectedBrightnessCriterionKeys = [...keys];
        updateNodeComplexityStyles();
      },
    };

    function formatCodeLines(value) {
      return Number(value || 0).toLocaleString("ru-RU");
    }

    function compactLines(value) {
      const n = Number(value || 0);
      if (n >= 1000000) {
        return (n / 1000000).toFixed(1).replace(/\\.0$/, "") + "M";
      }
      if (n >= 1000) {
        return (n / 1000).toFixed(1).replace(/\\.0$/, "") + "k";
      }
      return String(n);
    }

    function formatMetricValue(value) {
      const n = Number(value || 0);
      if (Number.isInteger(n)) {
        return String(n);
      }
      return n.toFixed(2).replace(/0+$/, "").replace(/\\.$/, "");
    }

    function formatStatsForTooltip(stats) {
      if (!stats || !stats.count) {
        return "-";
      }
      return (
        "avg " + formatMetricValue(stats.mean) +
        ", med " + formatMetricValue(stats.median) +
        ", P95 " + formatMetricValue(stats.p95) +
        ", max " + formatMetricValue(stats.max) +
        ", n=" + stats.count
      );
    }

    function renderModuleDetails(moduleId) {
      reportState.selectedModuleId = moduleId;
      emitReportState();
    }

    function renderFileDetails(file, moduleId) {
      reportState.selectedModuleId = moduleId;
      reportState.selectedFilePath = file ? file.relative_path : null;
      emitReportState();
    }

    function makeSvgEl(tagName) {
      return document.createElementNS("http://www.w3.org/2000/svg", tagName);
    }

    function interpolateChannel(start, end, ratio) {
      return Math.round(start + (end - start) * ratio);
    }

    function colorForComplexityRatio(ratio) {
      const normalized = Math.max(0, Math.min(1, ratio));
      const start = { r: 207, g: 231, b: 228 };
      const end = { r: 15, g: 118, b: 110 };
      return "rgb(" +
        interpolateChannel(start.r, end.r, normalized) + ", " +
        interpolateChannel(start.g, end.g, normalized) + ", " +
        interpolateChannel(start.b, end.b, normalized) + ")";
    }

    function strokeForComplexityRatio(ratio) {
      const normalized = Math.max(0, Math.min(1, ratio));
      const start = { r: 107, g: 114, b: 128 };
      const end = { r: 17, g: 94, b: 89 };
      return "rgb(" +
        interpolateChannel(start.r, end.r, normalized) + ", " +
        interpolateChannel(start.g, end.g, normalized) + ", " +
        interpolateChannel(start.b, end.b, normalized) + ")";
    }

    function textColorForComplexityRatio(ratio) {
      return ratio >= 0.45 ? "#ffffff" : "#111827";
    }

    function getBrightnessMetricValue(node, key) {
      const complexity = node.complexity || {};
      if (key === "cyclomatic_median") {
        return Number((complexity.cyclomatic && complexity.cyclomatic.median) || 0);
      }
      if (key === "cognitive_median") {
        return Number((complexity.cognitive && complexity.cognitive.median) || 0);
      }
      if (key === "jones_median") {
        return Number((complexity.jones && complexity.jones.median) || 0);
      }
      if (key === "method_count") {
        const methodCount = Number((complexity.cyclomatic && complexity.cyclomatic.count) || 0);
        return Math.log2(methodCount + 1);
      }
      if (key === "total_lines") {
        const totalLines = Number(node.python_lines || 0);
        return Math.log2(totalLines + 1);
      }
      if (key === "python_file_count") {
        const pythonFileCount = Number(node.python_complexity_file_count || 0);
        return Math.log2(pythonFileCount + 1);
      }
      return 0;
    }

    function getSelectedBrightnessCriterionKeys() {
      return [...reportState.selectedBrightnessCriterionKeys];
    }

    function computeComplexityWeight(node, selectedKeys) {
      const activeCriteria = brightnessCriteria.filter((criterion) => selectedKeys.includes(criterion.key));
      if (!activeCriteria.length) {
        return 0;
      }
      let weightedSum = 0;
      let weightTotal = 0;
      activeCriteria.forEach((criterion) => {
        weightedSum += getBrightnessMetricValue(node, criterion.key) * criterion.weight;
        weightTotal += criterion.weight;
      });
      return weightTotal > 0 ? weightedSum / weightTotal : 0;
    }

    function getSelectedCategoryKeys() {
      return [...reportState.selectedLineCategoryKeys];
    }

    function computeVisibleLines(node, selectedKeys) {
      let sum = 0;
      for (const key of selectedKeys) {
        sum += Number(node[key] || 0);
      }
      return sum;
    }

    function buildTooltipText(node, visible, selectedKeys) {
      const complexityLabel =
        " | CC " + formatStatsForTooltip(node.complexity && node.complexity.cyclomatic) +
        " | cognitive " + formatStatsForTooltip(node.complexity && node.complexity.cognitive) +
        " | Jones " + formatStatsForTooltip(node.complexity && node.complexity.jones);
      return (
        node.id +
        " | visible=" + formatCodeLines(visible) +
        complexityLabel
      );
    }

    function updateNodeComplexityStyles() {
      if (!graphNodes.length) {
        return;
      }
      const selectedBrightnessKeys = getSelectedBrightnessCriterionKeys();
      const maxComplexityWeight = Math.max(
        ...graphNodes.map((node) => computeComplexityWeight(node, selectedBrightnessKeys)),
        0,
      );
      graphNodes.forEach((node) => {
        node.complexityWeight = computeComplexityWeight(node, selectedBrightnessKeys);
        node.complexityRatio = maxComplexityWeight > 0 ? node.complexityWeight / maxComplexityWeight : 0;
        node.fillColor = colorForComplexityRatio(node.complexityRatio);
        node.strokeColor = strokeForComplexityRatio(node.complexityRatio);
        node.valueColor = textColorForComplexityRatio(node.complexityRatio);
        if (node.circleEl) {
          node.circleEl.setAttribute("fill", node.fillColor);
          node.circleEl.setAttribute("stroke", node.strokeColor);
        }
        if (node.valueEl) {
          node.valueEl.setAttribute("fill", node.valueColor);
        }
      });
      renderModuleDetails(selectedModuleId);
    }

    function renderGraph() {
      const svg = document.getElementById("couplingGraph");
      while (svg.firstChild) {
        svg.removeChild(svg.firstChild);
      }

      if (!graphData.nodes.length) {
        return;
      }

      const width = 1600;
      const height = 860;
      svg.setAttribute("viewBox", "0 0 " + width + " " + height);

      const defs = makeSvgEl("defs");
      const marker = makeSvgEl("marker");
      marker.setAttribute("id", "arrow");
      marker.setAttribute("viewBox", "0 0 10 10");
      marker.setAttribute("refX", "9");
      marker.setAttribute("refY", "5");
      marker.setAttribute("markerWidth", "6");
      marker.setAttribute("markerHeight", "6");
      marker.setAttribute("orient", "auto-start-reverse");
      const markerPath = makeSvgEl("path");
      markerPath.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
      markerPath.setAttribute("fill", "#6b7280");
      marker.appendChild(markerPath);
      defs.appendChild(marker);
      svg.appendChild(defs);

      const sortedNodes = [...graphData.nodes].sort((a, b) => a.id.localeCompare(b.id));
      const cx = width / 2;
      const cy = height / 2;
      const initialRadius = Math.min(width, height) / 2 - 140;

      const nodes = sortedNodes.map((node, index) => {
        const angle = (2 * Math.PI * index) / Math.max(sortedNodes.length, 1);
        const baseNode = {
          id: node.id,
          out: node.out,
          in: node.in,
          total: node.total,
          total_lines: node.total_lines || 0,
          python_complexity_file_count: node.python_complexity_file_count || 0,
          complexity: node.complexity || null,
          files: node.files || [],
          x: cx + initialRadius * Math.cos(angle),
          y: cy + initialRadius * Math.sin(angle),
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          r: neutralNodeRadius,
          isDragging: false,
        };
        lineCategoryKeys.forEach((key) => {
          baseNode[key] = Number(node[key] || 0);
        });
        return baseNode;
      });
      nodesById = new Map(nodes.map((node) => [node.id, node]));

      const edges = graphData.edges
        .map((edge) => {
          const sourceNode = nodesById.get(edge.source);
          const targetNode = nodesById.get(edge.target);
          if (!sourceNode || !targetNode) {
            return null;
          }
          return {
            ...edge,
            sourceNode,
            targetNode,
            pathEl: null,
          };
        })
        .filter(Boolean);
      const reverseEdgeSet = new Set(edges.map((edge) => edge.source + "->" + edge.target));

      const bgRect = makeSvgEl("rect");
      bgRect.setAttribute("x", String(-width * 10));
      bgRect.setAttribute("y", String(-height * 10));
      bgRect.setAttribute("width", String(width * 20));
      bgRect.setAttribute("height", String(height * 20));
      bgRect.setAttribute("fill", "transparent");
      bgRect.setAttribute("pointer-events", "all");
      bgRect.addEventListener("click", () => clearSelection());
      svg.appendChild(bgRect);

      const edgeGroup = makeSvgEl("g");
      const nodeGroup = makeSvgEl("g");
      const nodeValueGroup = makeSvgEl("g");
      const nodeLabelGroup = makeSvgEl("g");
      svg.appendChild(edgeGroup);
      svg.appendChild(nodeGroup);
      svg.appendChild(nodeValueGroup);
      svg.appendChild(nodeLabelGroup);

      edges.forEach((edge) => {
        const path = makeSvgEl("path");
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "#6b7280");
        path.setAttribute("stroke-width", String(0.9 + Math.min(2.1, edge.points / 18)));
        path.setAttribute("marker-end", "url(#arrow)");
        const edgeTitle = makeSvgEl("title");
          edgeTitle.textContent =
          edge.source + " -> " + edge.target +
          " | points=" + edge.points +
          " | reuse=" + edge.model_reuse +
          ", extend/method=" + edge.extension_or_method +
          ", view=" + edge.view +
          ", field/property=" + edge.field_property;
        path.appendChild(edgeTitle);
        edgeGroup.appendChild(path);
        edge.pathEl = path;
      });

      let activePointerId = null;
      let activeNode = null;
      let pointerDownClient = null;
      let pointerMovedBeyondThreshold = false;

      function pointerToSvg(clientX, clientY) {
        const point = svg.createSVGPoint();
        point.x = clientX;
        point.y = clientY;
        const matrix = svg.getScreenCTM();
        if (!matrix) {
          return { x: clientX, y: clientY };
        }
        return point.matrixTransform(matrix.inverse());
      }

      nodes.forEach((node) => {
        const circle = makeSvgEl("circle");
        circle.setAttribute("r", String(node.r));
        circle.setAttribute("fill", node.fillColor);
        circle.setAttribute("stroke", node.strokeColor);
        circle.setAttribute("stroke-width", "1.5");
        circle.setAttribute("class", "node-circle");
        const nodeTitle = makeSvgEl("title");
        nodeTitle.textContent = "";
        circle.appendChild(nodeTitle);
        node.titleEl = nodeTitle;

        circle.addEventListener("pointerdown", (event) => {
          activePointerId = event.pointerId;
          activeNode = node;
          activeNode.isDragging = true;
          pointerDownClient = { x: event.clientX, y: event.clientY };
          pointerMovedBeyondThreshold = false;
          circle.classList.add("dragging");
          circle.setPointerCapture(event.pointerId);
          const pos = pointerToSvg(event.clientX, event.clientY);
          activeNode.x = pos.x;
          activeNode.y = pos.y;
          activeNode.vx = 0;
          activeNode.vy = 0;
          event.preventDefault();
          event.stopPropagation();
        });

        circle.addEventListener("pointermove", (event) => {
          if (!activeNode || !activeNode.isDragging || event.pointerId !== activePointerId) {
            return;
          }
          if (pointerDownClient) {
            const dx = event.clientX - pointerDownClient.x;
            const dy = event.clientY - pointerDownClient.y;
            if (Math.hypot(dx, dy) > selectionDragThreshold) {
              pointerMovedBeyondThreshold = true;
            }
          }
          const pos = pointerToSvg(event.clientX, event.clientY);
          activeNode.x = pos.x;
          activeNode.y = pos.y;
          activeNode.vx = 0;
          activeNode.vy = 0;
        });

        function releaseNode(event) {
          if (!activeNode || event.pointerId !== activePointerId) {
            return;
          }
          const wasClick = !pointerMovedBeyondThreshold;
          const releasedNode = activeNode;
          activeNode.isDragging = false;
          circle.classList.remove("dragging");
          activeNode = null;
          activePointerId = null;
          pointerDownClient = null;
          pointerMovedBeyondThreshold = false;
          if (wasClick && event.type === "pointerup") {
            setSelectedModule(releasedNode.id);
            event.stopPropagation();
          }
        }

        circle.addEventListener("pointerup", releaseNode);
        circle.addEventListener("pointercancel", releaseNode);
        circle.addEventListener("click", (event) => {
          event.stopPropagation();
        });

        node.circleEl = circle;
        nodeGroup.appendChild(circle);

        const valueLabel = makeSvgEl("text");
        valueLabel.setAttribute("text-anchor", "middle");
        valueLabel.setAttribute("fill", node.valueColor);
        valueLabel.style.pointerEvents = "none";
        valueLabel.style.fontWeight = "700";
        valueLabel.textContent = "";
        node.valueEl = valueLabel;
        nodeValueGroup.appendChild(valueLabel);

        const label = makeSvgEl("text");
        label.setAttribute("font-size", "11");
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("fill", "#111827");
        label.style.pointerEvents = "none";
        label.textContent = node.id;
        node.labelEl = label;
        nodeLabelGroup.appendChild(label);
      });

      const repulsionStrength = 70000;
      const springStrength = 0.0017;
      const centerStrength = 0.00045;
      const velocityDecay = 0.9;
      const maxVelocity = 10;
      const cameraPadding = maxNodeRadius + 140;
      const cameraLerp = 0.18;
      const minViewWidth = width;
      const minViewHeight = height;
      const currentViewBox = { x: 0, y: 0, w: width, h: height };
      const zoomMin = 0.35;
      const zoomMax = 8;
      const zoomStep = 1.18;
      let zoomScale = 1;
      let manualPanX = 0;
      let manualPanY = 0;
      const zoomLabelEl = document.getElementById("graphZoomLabel");
      const zoomInButton = document.getElementById("graphZoomIn");
      const zoomOutButton = document.getElementById("graphZoomOut");
      const zoomResetButton = document.getElementById("graphZoomReset");

      function clamp(value, low, high) {
        return Math.max(low, Math.min(high, value));
      }

      function updateZoomLabel() {
        if (!zoomLabelEl) {
          return;
        }
        zoomLabelEl.textContent = "Zoom " + Math.round(zoomScale * 100) + "%";
      }

      function setZoom(nextScale) {
        zoomScale = clamp(nextScale, zoomMin, zoomMax);
        updateZoomLabel();
      }

      function updateViewBox() {
        if (!nodes.length) {
          return;
        }
        let minNodeX = Infinity;
        let maxNodeX = -Infinity;
        let minNodeY = Infinity;
        let maxNodeY = -Infinity;

        nodes.forEach((node) => {
          minNodeX = Math.min(minNodeX, node.x - node.r);
          maxNodeX = Math.max(maxNodeX, node.x + node.r);
          minNodeY = Math.min(minNodeY, node.y - node.r);
          maxNodeY = Math.max(maxNodeY, node.y + node.r);
        });

        let targetX = minNodeX - cameraPadding;
        let targetY = minNodeY - cameraPadding;
        let targetW = Math.max(minViewWidth, (maxNodeX - minNodeX) + cameraPadding * 2);
        let targetH = Math.max(minViewHeight, (maxNodeY - minNodeY) + cameraPadding * 2);

        if (targetW === minViewWidth) {
          targetX = ((minNodeX + maxNodeX) / 2) - targetW / 2;
        }
        if (targetH === minViewHeight) {
          targetY = ((minNodeY + maxNodeY) / 2) - targetH / 2;
        }

        const targetCenterX = targetX + targetW / 2;
        const targetCenterY = targetY + targetH / 2;
        targetW /= zoomScale;
        targetH /= zoomScale;
        targetX = targetCenterX - targetW / 2;
        targetY = targetCenterY - targetH / 2;
        targetX += manualPanX;
        targetY += manualPanY;

        currentViewBox.x += (targetX - currentViewBox.x) * cameraLerp;
        currentViewBox.y += (targetY - currentViewBox.y) * cameraLerp;
        currentViewBox.w += (targetW - currentViewBox.w) * cameraLerp;
        currentViewBox.h += (targetH - currentViewBox.h) * cameraLerp;
        svg.setAttribute(
          "viewBox",
          currentViewBox.x + " " + currentViewBox.y + " " + currentViewBox.w + " " + currentViewBox.h,
        );
      }

      function applyPhysics() {
        for (let i = 0; i < nodes.length; i += 1) {
          const nodeA = nodes[i];
          for (let j = i + 1; j < nodes.length; j += 1) {
            const nodeB = nodes[j];
            let dx = nodeB.x - nodeA.x;
            let dy = nodeB.y - nodeA.y;
            let distSq = dx * dx + dy * dy;
            if (distSq < 1) {
              distSq = 1;
              dx = 1;
              dy = 0;
            }
            const dist = Math.sqrt(distSq);
            const force = repulsionStrength / distSq;
            const fx = (force * dx) / dist;
            const fy = (force * dy) / dist;
            nodeA.vx -= fx;
            nodeA.vy -= fy;
            nodeB.vx += fx;
            nodeB.vy += fy;
          }
        }

        edges.forEach((edge) => {
          const source = edge.sourceNode;
          const target = edge.targetNode;
          let dx = target.x - source.x;
          let dy = target.y - source.y;
          const dist = Math.hypot(dx, dy) || 1;
          const desired = 200 - Math.min(18, edge.points * 0.9);
          const stretch = dist - desired;
          const force = springStrength * stretch;
          const fx = (force * dx) / dist;
          const fy = (force * dy) / dist;
          source.vx += fx;
          source.vy += fy;
          target.vx -= fx;
          target.vy -= fy;
        });

        nodes.forEach((node) => {
          if (node.isDragging) {
            node.vx = 0;
            node.vy = 0;
            return;
          }

          node.vx += (cx - node.x) * centerStrength;
          node.vy += (cy - node.y) * centerStrength;
          node.vx *= velocityDecay;
          node.vy *= velocityDecay;
          node.vx = clamp(node.vx, -maxVelocity, maxVelocity);
          node.vy = clamp(node.vy, -maxVelocity, maxVelocity);
          node.x += node.vx;
          node.y += node.vy;
        });
      }

      function renderFrame() {
        edges.forEach((edge) => {
          const source = edge.sourceNode;
          const target = edge.targetNode;
          let dx = target.x - source.x;
          let dy = target.y - source.y;
          const dist = Math.hypot(dx, dy) || 1;
          const ux = dx / dist;
          const uy = dy / dist;
          const startX = source.x + ux * (source.r + 1.5);
          const startY = source.y + uy * (source.r + 1.5);
          const endX = target.x - ux * (target.r + 4);
          const endY = target.y - uy * (target.r + 4);
          const nx = -uy;
          const ny = ux;
          const hasReverse = reverseEdgeSet.has(edge.target + "->" + edge.source);
          const curve = hasReverse ? (edge.source < edge.target ? 24 : -24) : 0;
          const cxCurve = (startX + endX) / 2 + nx * curve;
          const cyCurve = (startY + endY) / 2 + ny * curve;

          edge.pathEl.setAttribute(
            "d",
            "M " + startX + " " + startY + " Q " + cxCurve + " " + cyCurve + " " + endX + " " + endY,
          );
        });

        nodes.forEach((node) => {
          node.circleEl.setAttribute("cx", String(node.x));
          node.circleEl.setAttribute("cy", String(node.y));
          node.valueEl.setAttribute("x", String(node.x));
          node.valueEl.setAttribute("y", String(node.y + 4));
          node.valueEl.setAttribute("font-size", String(Math.max(10, Math.min(16, node.r * 0.33))));
          node.labelEl.setAttribute("x", String(node.x));
          node.labelEl.setAttribute("y", String(node.y - node.r - 10));
        });
      }

      function tick() {
        applyPhysics();
        renderFrame();
        updateViewBox();
        requestAnimationFrame(tick);
      }

      renderFrame();
      updateViewBox();
      requestAnimationFrame(tick);
      graphNodes = nodes;
      updateNodeComplexityStyles();
      updateZoomLabel();

      if (zoomInButton) {
        zoomInButton.addEventListener("click", () => setZoom(zoomScale * zoomStep));
      }
      if (zoomOutButton) {
        zoomOutButton.addEventListener("click", () => setZoom(zoomScale / zoomStep));
      }
      if (zoomResetButton) {
        zoomResetButton.addEventListener("click", () => {
          manualPanX = 0;
          manualPanY = 0;
          setZoom(1);
        });
      }
      svg.addEventListener(
        "wheel",
        (event) => {
          event.preventDefault();
          const screenWidth = svg.clientWidth || width;
          const screenHeight = svg.clientHeight || height;
          const worldPerPixelX = currentViewBox.w / screenWidth;
          const worldPerPixelY = currentViewBox.h / screenHeight;
          manualPanX += event.deltaX * worldPerPixelX;
          manualPanY += event.deltaY * worldPerPixelY;
        },
        { passive: false },
      );
      applyLineCategorySelection();
    }

    let graphNodes = [];
    let nodesById = new Map();
    let selectedModuleId = null;
    let selectedFilePath = null;

    function buildFolderPalette(folders) {
      const sorted = [...folders].filter((folder) => folder !== "<root>").sort();
      const map = new Map();
      sorted.forEach((folder, idx) => {
        map.set(folder, treemapPalette[idx % treemapPalette.length]);
      });
      return map;
    }

    function colorForFolder(folder, palette) {
      if (folder === "<root>") {
        return treemapRootColor;
      }
      return palette.get(folder) || treemapFallbackColor;
    }

    function categoryLabelOf(categoryKey) {
      const found = lineCategories.find((category) => category.key === categoryKey);
      return found ? found.label : categoryKey;
    }

    function updateTreemapSelection() {
      document.querySelectorAll("#moduleFileMap .treemap-tile").forEach((tile) => {
        tile.classList.toggle("selected", tile.dataset.filePath === selectedFilePath);
      });
    }

    function squarifyTreemap(items, rect) {
      if (!items.length || rect.w <= 0 || rect.h <= 0) {
        return [];
      }
      const total = items.reduce((sum, item) => sum + item.value, 0);
      if (total <= 0) {
        return [];
      }
      const scale = (rect.w * rect.h) / total;
      const scaledValues = items.map((item) => item.value * scale);

      const results = new Array(items.length);
      let cursor = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
      let row = [];
      let rowStartIdx = 0;
      let i = 0;

      function shortSide(currentRect) {
        return Math.min(currentRect.w, currentRect.h);
      }

      function worstAspect(currentRow, side) {
        const sum = currentRow.reduce((acc, val) => acc + val, 0);
        if (sum <= 0) {
          return Infinity;
        }
        const max = Math.max(...currentRow);
        const min = Math.min(...currentRow);
        const s2 = side * side;
        const sum2 = sum * sum;
        return Math.max((s2 * max) / sum2, sum2 / (s2 * min));
      }

      function flushRow() {
        if (!row.length) {
          return;
        }
        const side = shortSide(cursor);
        const sum = row.reduce((acc, val) => acc + val, 0);
        if (sum <= 0 || side <= 0) {
          row = [];
          return;
        }
        const thickness = sum / side;
        if (cursor.w >= cursor.h) {
          let yPos = cursor.y;
          for (let k = 0; k < row.length; k += 1) {
            const tileHeight = (row[k] / sum) * cursor.h;
            results[rowStartIdx + k] = {
              x: cursor.x,
              y: yPos,
              w: thickness,
              h: tileHeight,
              item: items[rowStartIdx + k],
            };
            yPos += tileHeight;
          }
          cursor = {
            x: cursor.x + thickness,
            y: cursor.y,
            w: cursor.w - thickness,
            h: cursor.h,
          };
        } else {
          let xPos = cursor.x;
          for (let k = 0; k < row.length; k += 1) {
            const tileWidth = (row[k] / sum) * cursor.w;
            results[rowStartIdx + k] = {
              x: xPos,
              y: cursor.y,
              w: tileWidth,
              h: thickness,
              item: items[rowStartIdx + k],
            };
            xPos += tileWidth;
          }
          cursor = {
            x: cursor.x,
            y: cursor.y + thickness,
            w: cursor.w,
            h: cursor.h - thickness,
          };
        }
        rowStartIdx += row.length;
        row = [];
      }

      while (i < scaledValues.length) {
        const value = scaledValues[i];
        const side = shortSide(cursor);
        if (side <= 0) {
          break;
        }
        const newRow = [...row, value];
        const currentWorst = row.length ? worstAspect(row, side) : Infinity;
        const newWorst = worstAspect(newRow, side);
        if (newWorst <= currentWorst) {
          row = newRow;
          i += 1;
        } else {
          flushRow();
        }
      }
      if (row.length) {
        flushRow();
      }
      return results;
    }

    function renderTreemap() {
      const svg = document.getElementById("moduleFileMap");
      const headerEl = document.getElementById("treemapHeader");
      const legendEl = document.getElementById("treemapLegend");
      while (svg.firstChild) {
        svg.removeChild(svg.firstChild);
      }
      legendEl.innerHTML = "";

      if (!selectedModuleId) {
        headerEl.classList.add("empty");
        headerEl.textContent = "Click a module on the graph to see its file map.";
        renderFileDetails(null, null);
        return;
      }

      const node = nodesById.get(selectedModuleId);
      const files = (node && node.files) || [];
      const selectedKeys = new Set(getSelectedCategoryKeys());
      const visibleFiles = files
        .filter((file) => selectedKeys.has(file.category) && file.lines > 0)
        .sort((a, b) => b.lines - a.lines);
      const visibleTotal = visibleFiles.reduce((sum, file) => sum + file.lines, 0);

      if (!visibleFiles.length || visibleTotal <= 0) {
        headerEl.classList.remove("empty");
        headerEl.textContent =
          "Module " + selectedModuleId + " — No files in selected categories.";
        renderFileDetails(null, selectedModuleId);
        return;
      }

      headerEl.classList.remove("empty");
      headerEl.textContent =
        "Module " + selectedModuleId +
        " — total visible lines: " + formatCodeLines(visibleTotal);

      const folderSet = new Set(visibleFiles.map((file) => file.top_folder));
      const palette = buildFolderPalette(folderSet);
      const orderedFolders = [...folderSet].sort((a, b) => {
        if (a === "<root>") return 1;
        if (b === "<root>") return -1;
        return a.localeCompare(b);
      });
      orderedFolders.forEach((folder) => {
        const item = document.createElement("span");
        item.className = "legend-item";
        const swatch = document.createElement("span");
        swatch.className = "legend-swatch";
        swatch.style.background = colorForFolder(folder, palette);
        item.appendChild(swatch);
        item.appendChild(document.createTextNode(folder));
        legendEl.appendChild(item);
      });

      const containerWidth = svg.clientWidth || treemapWidth;
      const containerHeight = svg.clientHeight || treemapHeight;
      svg.setAttribute("viewBox", "0 0 " + containerWidth + " " + containerHeight);
      const layoutItems = visibleFiles.map((file) => ({ value: file.lines, file }));
      const layout = squarifyTreemap(layoutItems, {
        x: 0,
        y: 0,
        w: containerWidth,
        h: containerHeight,
      });

      layout.forEach((cell) => {
        if (!cell || cell.w <= 0 || cell.h <= 0) {
          return;
        }
        const file = cell.item.file;
        const tile = makeSvgEl("g");
        tile.setAttribute("class", "treemap-tile");
        tile.dataset.filePath = file.relative_path;
        tile.style.cursor = "pointer";

        const innerW = Math.max(0, cell.w - treemapTilePadding);
        const innerH = Math.max(0, cell.h - treemapTilePadding);
        const rect = makeSvgEl("rect");
        rect.setAttribute("x", String(cell.x + treemapTilePadding / 2));
        rect.setAttribute("y", String(cell.y + treemapTilePadding / 2));
        rect.setAttribute("width", String(innerW));
        rect.setAttribute("height", String(innerH));
        rect.setAttribute("fill", colorForFolder(file.top_folder, palette));

        const title = makeSvgEl("title");
        let tooltip =
          file.relative_path +
          " | lines=" + compactLines(file.lines) +
          " | " + categoryLabelOf(file.category);
        if (file.complexity) {
          tooltip += " | CC " + formatStatsForTooltip(file.complexity.cyclomatic);
          tooltip += " | cognitive " + formatStatsForTooltip(file.complexity.cognitive);
          tooltip += " | Jones " + formatStatsForTooltip(file.complexity.jones);
        }
        if (file.parse_error) {
          tooltip += " | parse_error=" + file.parse_error;
        }
        title.textContent = tooltip;
        rect.appendChild(title);
        tile.appendChild(rect);
        tile.addEventListener("mouseenter", () => {
          selectedFilePath = file.relative_path;
          renderFileDetails(file, selectedModuleId);
          updateTreemapSelection();
        });
        tile.addEventListener("click", () => {
          selectedFilePath = file.relative_path;
          renderFileDetails(file, selectedModuleId);
          updateTreemapSelection();
        });

        if (innerW >= treemapMinTextWidth && innerH >= treemapMinTextHeight) {
          const basename = file.relative_path.split("/").pop();
          const centerX = cell.x + cell.w / 2;
          const centerY = cell.y + cell.h / 2;
          const charPx = 6.8;
          const horizontalPadding = 6;
          const maxChars = Math.floor((innerW - horizontalPadding) / charPx);
          const truncate = (text) => {
            if (maxChars < 3) {
              return null;
            }
            if (text.length <= maxChars) {
              return text;
            }
            return text.slice(0, Math.max(1, maxChars - 1)) + "…";
          };
          const displayName = truncate(basename);
          const displayLines = truncate(compactLines(file.lines));

          if (displayName) {
            const nameText = makeSvgEl("text");
            nameText.setAttribute("x", String(centerX));
            nameText.setAttribute("y", String(displayLines ? centerY - 2 : centerY + 4));
            nameText.setAttribute("text-anchor", "middle");
            nameText.setAttribute("font-size", "12");
            nameText.setAttribute("font-weight", "600");
            nameText.textContent = displayName;
            tile.appendChild(nameText);
          }

          if (displayLines) {
            const linesText = makeSvgEl("text");
            linesText.setAttribute("x", String(centerX));
            linesText.setAttribute("y", String(displayName ? centerY + 14 : centerY + 4));
            linesText.setAttribute("text-anchor", "middle");
            linesText.setAttribute("font-size", "12");
            linesText.textContent = displayLines;
            tile.appendChild(linesText);
          }
        }

        svg.appendChild(tile);
      });

      const selectedFile = visibleFiles.find((item) => item.relative_path === selectedFilePath) || null;
      updateTreemapSelection();
      renderFileDetails(selectedFile, selectedModuleId);
    }

    function applySelectionHighlight() {
      graphNodes.forEach((node) => {
        if (node.circleEl) {
          node.circleEl.classList.toggle("selected", node.id === selectedModuleId);
        }
      });
    }

    function setSelectedModule(moduleId) {
      selectedModuleId = selectedModuleId === moduleId ? null : moduleId;
      selectedFilePath = null;
      applySelectionHighlight();
      renderModuleDetails(selectedModuleId);
      renderTreemap();
    }

    function clearSelection() {
      if (selectedModuleId === null) {
        return;
      }
      selectedModuleId = null;
      selectedFilePath = null;
      applySelectionHighlight();
      renderModuleDetails(null);
      renderTreemap();
    }

    function applyLineCategorySelection() {
      const selectedKeys = getSelectedCategoryKeys();
      if (!graphNodes.length) {
        reportState.visibleLinesTotal = 0;
        emitReportState();
        return;
      }

      const visibleByNode = new Map();
      let visibleTotal = 0;
      graphNodes.forEach((node) => {
        const value = computeVisibleLines(node, selectedKeys);
        visibleByNode.set(node.id, value);
        visibleTotal += value;
      });

      const hasSelection = selectedKeys.length > 0;
      const maxVisible = hasSelection
        ? Math.max(...visibleByNode.values(), 1)
        : 1;
      const radiusScale = hasSelection ? maxNodeRadius / Math.sqrt(maxVisible) : 0;

      graphNodes.forEach((node) => {
        const visible = visibleByNode.get(node.id) || 0;
        if (!hasSelection) {
          node.r = neutralNodeRadius;
        } else {
          const scaled = Math.sqrt(Math.max(visible, 1)) * radiusScale;
          node.r = Math.max(minNodeRadius, Math.min(maxNodeRadius, scaled));
        }
        if (node.circleEl) {
          node.circleEl.setAttribute("r", String(node.r));
        }
        if (node.valueEl) {
          node.valueEl.textContent = hasSelection ? formatCodeLines(visible) : "";
        }
        if (node.titleEl) {
          node.titleEl.textContent = buildTooltipText(node, visible, selectedKeys);
        }
      });
      reportState.visibleLinesTotal = visibleTotal;
      emitReportState();
      renderTreemap();
    }

    renderGraph();
