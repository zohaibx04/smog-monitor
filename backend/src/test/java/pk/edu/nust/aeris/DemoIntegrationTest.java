package pk.edu.nust.aeris;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:smogDemoTests",
    "spring.datasource.username=sa", "spring.datasource.password=",
    "spring.jpa.hibernate.ddl-auto=create-drop",
    "aeris.demo=true", "aeris.initial-delay=99999999"
})
@AutoConfigureMockMvc
@Transactional
class DemoIntegrationTest {
    @Autowired MockMvc mvc;

    @Test void simulatesOneAlertEpisodeAndResolvesItOnRecovery() throws Exception {
        mvc.perform(get("/api/status")).andExpect(jsonPath("$.mode").value("demo"));
        submit(120);
        mvc.perform(get("/api/alerts")).andExpect(jsonPath("$.length()").value(0));
        submit(175);
        var alert = mvc.perform(get("/api/alerts"))
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].status").value("Active"))
            .andReturn().getResponse().getContentAsString();
        var id = new com.fasterxml.jackson.databind.ObjectMapper().readTree(alert).get(0).get("id").asLong();
        submit(185);
        mvc.perform(get("/api/alerts")).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(patch("/api/alerts/" + id)).andExpect(jsonPath("$.status").value("Acknowledged"));
        submit(110);
        mvc.perform(get("/api/alerts")).andExpect(jsonPath("$[0].status").value("Resolved"));
        mvc.perform(get("/api/areas"))
            .andExpect(jsonPath("$[0].reading.aqi").value(110))
            .andExpect(jsonPath("$[0].reading.pm25").isNumber())
            .andExpect(jsonPath("$[0].reading.pm10").isNumber())
            .andExpect(jsonPath("$[0].reading.source").value(MonitoringService.DEMO_SOURCE));
    }

    private void submit(int aqi) throws Exception {
        mvc.perform(post("/api/demo/areas/1/readings").contentType(MediaType.APPLICATION_JSON)
            .content("{\"aqi\":" + aqi + "}")).andExpect(status().isOk());
    }
}
