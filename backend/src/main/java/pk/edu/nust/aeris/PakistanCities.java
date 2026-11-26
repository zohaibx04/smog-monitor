package pk.edu.nust.aeris;

import java.util.List;

/** City-centre coordinates identify configured locations, not sensor coordinates. */
final class PakistanCities {
    record City(String name,String region,double latitude,double longitude) {}
    static final List<City> ALL=List.of(
        new City("Karachi","Sindh",24.8607,67.0011),
        new City("Lahore","Punjab",31.5204,74.3587),
        new City("Islamabad","Islamabad",33.72148,73.04329),
        new City("Peshawar","Khyber Pakhtunkhwa",34.0151,71.5249),
        new City("Quetta","Balochistan",30.1798,66.9750));
    static City find(String name) {
        return ALL.stream().filter(c -> name.equalsIgnoreCase(c.name()) || name.equalsIgnoreCase(c.name()+", Pakistan")).findFirst().orElse(null);
    }
}
